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

for (const [constName, field, isArray] of ENUMS) {
  const opts = optionsOf(constName);
  if (!opts) continue;
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
    const emitted = [...apiSrc.slice(s0, apiSrc.indexOf('\n  };', s0)).matchAll(/^\s{4}([a-z_0-9]+):/gm)].map((m) => m[1]);
    const accepted = new Set(Object.keys(waitlistSchema._def?.schema?.shape ?? waitlistSchema.shape));
    for (const k of emitted) if (!accepted.has(k)) results.key.push(k);
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
  if (!b || !b.includes('otherKey')) continue;
  const own = b.match(/otherMax:\s*([A-Za-z_0-9]+)/)?.[1];
  const cap = own && /^\d+$/.test(own)
    ? Number(own)
    : Number(fieldsSrc.match(new RegExp(`export const ${own}\\s*=\\s*(\\d+)`))?.[1] ?? OTHER_MAX);
  if (!cap) continue;
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
