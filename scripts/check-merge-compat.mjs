/**
 * Would this client survive this server?
 *
 *   node scripts/check-merge-compat.mjs <client-ref> [--server <ref>]
 *   node scripts/check-merge-compat.mjs origin/polish/round-2
 *   node scripts/check-merge-compat.mjs origin/growth/waitlist-conversion
 *
 * Run BEFORE merging. Takes the client's field definitions from a git ref and
 * pushes every value a user can physically choose through the server's real
 * validator — no hand-enumeration, no reading of diffs.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * On 2026-08-19 `polish/round-2` and `sec/hardening` were each internally
 * correct and catastrophic together: the server had dropped ten enum values the
 * client still offered, so every option on two screens returned 400. Neither
 * branch's diff showed it. You could only see it by running one against the
 * other, which nothing did, because each side tested its own.
 *
 * That is the branch-topology form of the failure that ran through the whole
 * integration: components verified, the join not. The join here is a merge, and
 * a merge has no owner who tests it — so it gets a tool instead of a habit.
 *
 * Checks three kinds of drift in one pass:
 *   VALUE  an enum option the client offers and the server rejects
 *   KEY    a payload field the server does not accept
 *   CAP    a client length limit looser than the server's, which is a 400 for
 *          everything in the gap rather than a laxer client
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const clientRef = args[0];
if (!clientRef) {
  console.error('usage: check-merge-compat.mjs <client-ref> [--server <ref>]');
  process.exit(2);
}

/**
 * Read a file from a git ref, or from a directory on disk.
 *
 * The directory form matters: the merge candidate you most want to check is
 * usually the one in a working tree with conflicts just resolved, before any
 * commit exists to name.
 */
const show = (ref, path) => {
  if (existsSync(join(ref, path))) {
    try {
      return readFileSync(join(ref, path), 'utf8');
    } catch {
      return null;
    }
  }
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: 1 << 24 });
  } catch {
    return null;
  }
};

const FIELDS = 'src/components/waitlist/fields.js';
const API = 'src/components/waitlist/api.js';

const fieldsSrc = show(clientRef, FIELDS);
if (!fieldsSrc) {
  console.error(`cannot read ${FIELDS} at ${clientRef}`);
  process.exit(2);
}
const apiSrc = show(clientRef, API) ?? '';

const { validateWaitlist, waitlistSchema } = await import('../src/lib/validation.js');

// ─── Extract ─────────────────────────────────────────────────────────────────

/** Anchored on the exact declaration — `DIETARY` must not match `DIETARY_OTHER_MAX`. */
function block(name) {
  const m = fieldsSrc.match(new RegExp(`export const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  return m ? m[1] : null;
}
function optionsOf(name) {
  const b = block(name);
  if (!b) return null;
  const vals = [...b.matchAll(/value:\s*"?([A-Za-z_0-9]+)"?/g)].map((m) => m[1]);
  return vals.length ? vals : null;
}
function keyOf(name) {
  const b = block(name);
  return b ? b.match(/key:\s*"([a-z_0-9]+)"/)?.[1] ?? null : null;
}

/** A payload the server accepts, to mutate one field at a time. */
const BASE = {
  email: 'compat@example.com',
  consent_marketing: true,
  form_render_ts: Date.now() - 9000,
};

// Some enums only make sense with a companion field set.
const COMPANION = {
  motivation: { consent_health: true, motivation_consent_text_version: '2026-08-19.health-medication.a' },
  dietary: { consent_health: true, motivation_consent_text_version: '2026-08-15.health.a' },
};

const results = { value: [], key: [], cap: [] };

/**
 * Coverage, tracked so the verdict can be trusted.
 *
 * The first version of this tool reported COMPATIBLE while comparing ZERO
 * enums: `optionsOf()` returned null for a file whose formatting its regex did
 * not match, the loop did `continue`, and silence was rendered as success. Two
 * values that could not possibly validate passed without comment.
 *
 * That is the precise fault this tool exists to catch, committed by the tool
 * itself — a check passing because it found nothing to check rather than
 * because nothing was wrong. So coverage is now part of the result: the run
 * FAILS if an expected extractor came back empty, and the report always states
 * what was actually compared. A verdict with no denominator is not a verdict.
 */
const blindEarly = [];
const coverage = { enums: [], missed: [], values: 0, keys: 0, knownKeys: 0, keySetDisagreement: [], caps: 0, capsMissed: [] };

// ─── VALUE drift ─────────────────────────────────────────────────────────────

const ENUMS = [
  ['QUANTITY_BAND', 'quantity_band', false],
  ['PRICE_BAND', 'price_band', false],
  ['MOTIVATION', 'motivation', true],
  ['DIETARY', 'dietary', true],
  ['CHANNEL', 'channel', true],
  ['REFERRAL_SOURCE', 'referral_source', false],
  ['INTENT', 'intent', false],
  ['FLAVOR', 'flavor', false],
  ['OFFICE_INTEREST', 'office_interest', false],
  ['COMPANY_HEADCOUNT', 'headcount', false],
];

// FLOOR THE LIST BEFORE ITERATING IT.
//
// Deleting four rows from ENUMS above — including MOTIVATION and DIETARY, the
// two Art 9 health fields — produced:
//
//   compared 29 enum values across 6 enums ... COMPATIBLE
//
// Green, exit 0, and the checks on special-category data simply gone. An
// assertion inside a loop is an assertion about the fixture until something
// floors the fixture (Conversion's phrasing, after finding the same shape twice
// in their own suite).
//
// So the floor is a SECOND, INDEPENDENT reading: every field the schema declares
// with optionalEnum() or multiEnum() must appear in ENUMS. Two readings that
// disagree prove one is wrong — the discipline already used for the payload
// keys via SERVER_KNOWN_KEYS.
{
  const declared = [...readFileSync(new URL('../src/lib/validation.js', import.meta.url), 'utf8')
    .matchAll(/^\s+([a-z_0-9]+): (?:optionalEnum|multiEnum)\(([A-Z_0-9]+)\)/gm)].map((m) => m[1]);
  if (declared.length < 8) {
    blindEarly.push(`read only ${declared.length} enum-typed fields from the schema — the floor itself is broken`);
  }
  const covered = new Set(ENUMS.map(([, field]) => field));
  const uncovered = declared.filter((f) => !covered.has(f));
  if (uncovered.length) {
    blindEarly.push(`ENUMS does not cover schema enum fields: ${uncovered.join(', ')}`);
  }
}

for (const [constName, field, isArray] of ENUMS) {
  const opts = optionsOf(constName);
  if (!opts) {
    // NOT a silent skip. An enum we expected and could not read means the
    // parse is wrong, not that the enum is absent, and the difference is
    // invisible from the verdict unless it is recorded.
    coverage.missed.push(constName);
    continue;
  }
  coverage.enums.push(constName);
  coverage.values += opts.length;
  const target = keyOf(constName) ?? field;
  for (const value of opts) {
    if (value === 'true' || value === 'false') continue; // booleans, not enums
    const payload = { ...BASE, ...(COMPANION[target] ?? {}), [target]: isArray ? [value] : value };
    const v = validateWaitlist(payload);
    if (!v.ok) results.value.push({ field: target, value, why: v.issues.map((i) => i.rule).join(',') });
  }
}

// ─── KEY drift ───────────────────────────────────────────────────────────────

if (apiSrc) {
  const s0 = apiSrc.indexOf('  return {', apiSrc.indexOf('export function buildPayload'));
  if (s0 > 0) {
    const body = apiSrc.slice(s0, apiSrc.indexOf('\n  };', s0));
    // ANY indentation, not exactly four.
    //
    // `^\s{4}` matched only keys written flat in the returned literal, so a key
    // spread in conditionally —
    //
    //     ...(business ? { business_enquiry: true, ... } : {}),
    //
    // — sat at ten spaces and was invisible. This tool reported "COMPATIBLE,
    // 40 payload keys" while not looking at two of the client's forty-two, and
    // conditionally-spread keys are the newest and most drift-prone ones there
    // are. Exactly the fault this tool exists to catch, in the tool.
    // Charset includes UPPERCASE, and that is not pedantry. `[a-z_0-9]+` made
    // any camelCase key invisible — so a client sending `businessEnquiry`
    // instead of `business_enquiry` would be silently unread here AND rejected
    // by the strict schema, which is precisely the drift this tool exists to
    // catch. camelCase is the natural style in a JS client; the snake_case
    // contract is the deliberate exception. Found by mutating a key and
    // watching the checker stay green.
    const emitted = [...body.matchAll(/^\s+([A-Za-z_0-9]+):/gm)].map((m) => m[1]);
    const accepted = new Set(Object.keys(waitlistSchema._def?.schema?.shape ?? waitlistSchema.shape));
    coverage.keys = emitted.length;
    for (const k of emitted) if (!accepted.has(k)) results.key.push(k);

    // SECOND, INDEPENDENT EXTRACTION of the same fact, from a different
    // declaration. The point is not extra coverage — it is that two readings
    // which disagree prove one of them is wrong, which a single reading can
    // never do however carefully it is written.
    const skkMatch = apiSrc.match(/SERVER_KNOWN_KEYS = new Set\(\[([\s\S]*?)\]\)/);
    if (skkMatch) {
      const known = [...skkMatch[1].matchAll(/["']([a-z_0-9]+)["']/g)].map((m) => m[1]);
      coverage.knownKeys = known.length;
      for (const k of known) if (!accepted.has(k)) results.key.push(k);
      // Every ladder key must be something buildPayload can actually emit. A
      // key in one and not the other means an extractor is misreading, or the
      // ladder is carrying a rung for a field that no longer exists.
      coverage.keySetDisagreement = known.filter((k) => !emitted.includes(k));
    }
  }
}

// ─── CAP drift ───────────────────────────────────────────────────────────────
// A client cap ABOVE the server's is not a laxer client; it is a 400 for every
// answer in the gap. Measured by submitting a string of the client's length.

const OTHER_MAX = Number(fieldsSrc.match(/export const OTHER_MAX\s*=\s*(\d+)/)?.[1] ?? 0);
for (const [constName, otherField, parentField, parentValue] of [
  ['REFERRAL_SOURCE', 'referral_source_other', 'referral_source', 'other'],
  ['CHANNEL', 'channel_other', 'channel', 'other'],
  ['DIETARY', 'dietary_other', 'dietary', 'other'],
  ['PRICE_BAND', 'price_band_other', 'price_band', 'other'],
]) {
  const b = block(constName);
  if (!b) {
    coverage.capsMissed.push(constName);
    continue;
  }
  if (!b.includes('otherKey')) continue; // genuinely has no free-text box
  const own = b.match(/otherMax:\s*([A-Za-z_0-9]+)/)?.[1];
  const cap = own && /^\d+$/.test(own)
    ? Number(own)
    : Number(fieldsSrc.match(new RegExp(`export const ${own}\\s*=\\s*(\\d+)`))?.[1] ?? OTHER_MAX);
  if (!cap) {
    coverage.capsMissed.push(`${constName}(no cap resolved)`);
    continue;
  }
  coverage.caps += 1;
  const arrayed = ['channel', 'dietary'].includes(parentField);
  const payload = {
    ...BASE,
    ...(COMPANION[parentField] ?? {}),
    [parentField]: arrayed ? [parentValue] : parentValue,
    [otherField]: 'x'.repeat(cap),
  };
  const v = validateWaitlist(payload);
  if (!v.ok) results.cap.push({ field: otherField, clientCap: cap, why: v.issues.map((i) => `${i.path}:${i.rule}`).join(',') });
}

// ─── Report ──────────────────────────────────────────────────────────────────

const serverRef = args.includes('--server') ? args[args.indexOf('--server') + 1] : 'working tree';
console.log(`\n  client ${clientRef}   vs   server ${serverRef}\n`);

// A run that read nothing cannot clear a merge, however clean it looks.
const blind = [];
if (!coverage.enums.length) blind.push('parsed ZERO enum definitions');
if (coverage.missed.length) blind.push(`could not read: ${coverage.missed.join(', ')}`);
// A gate that only trips at ZERO is a gate against total failure, and total
// failure is the least likely kind. This tool read 40 of 42 keys and said
// COMPATIBLE with full confidence. So the checks below are RELATIVE — they
// compare two independent readings — rather than merely asking whether one of
// them returned something.
blind.push(...blindEarly);
if (!coverage.keys) blind.push('read no payload keys from buildPayload');
if (!coverage.knownKeys) blind.push('read no SERVER_KNOWN_KEYS — second reading unavailable, so nothing cross-checks the first');
if (coverage.keySetDisagreement?.length) {
  blind.push(`SERVER_KNOWN_KEYS lists keys buildPayload never emits: ${coverage.keySetDisagreement.join(', ')} — one of the two readings is wrong`);
}
if (coverage.capsMissed.length) blind.push(`cap unreadable: ${coverage.capsMissed.join(', ')}`);

console.log(`  compared ${coverage.values} enum values across ${coverage.enums.length} enums, ` +
            `${coverage.keys} payload keys (${coverage.knownKeys ?? '?'} cross-checked via SERVER_KNOWN_KEYS), ` +
            `${coverage.caps} free-text caps`);
if (blind.length) {
  console.log('\n  ⚠ COVERAGE FAILURE — this run did not look at everything it claims to check:');
  for (const b of blind) console.log(`     ${b}`);
  console.log('\n  A pass here would mean "found nothing", not "nothing wrong". Refusing to.\n');
  process.exit(2);
}
console.log('');

const total = results.value.length + results.key.length + results.cap.length;

if (results.value.length) {
  console.log('  VALUE DRIFT — options the client offers and the server rejects:');
  const byField = {};
  for (const r of results.value) (byField[r.field] ??= []).push(r.value);
  for (const [f, vs] of Object.entries(byField)) {
    console.log(`    ${f}: ${vs.length} rejected  →  ${vs.join(', ')}`);
  }
  console.log('');
}
if (results.key.length) {
  console.log(`  KEY DRIFT — fields the server does not accept:\n    ${results.key.join(', ')}\n`);
}
if (results.cap.length) {
  console.log('  CAP DRIFT — client allows longer than the server:');
  for (const r of results.cap) console.log(`    ${r.field}: client ${r.clientCap} → ${r.why}`);
  console.log('');
}

console.log(total === 0 ? '  COMPATIBLE — no value, key or cap drift.\n' : `  ${total} INCOMPATIBILITY(S). Do not merge these two together.\n`);
process.exit(total === 0 ? 0 : 1);
