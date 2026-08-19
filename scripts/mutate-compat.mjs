#!/usr/bin/env node
/**
 * Prove `security:compat` can still see what it claims to check — by breaking
 * things on purpose and requiring it to notice.
 *
 *   npm run security:mutate [<client-dir>]     default: ../zuca-growth
 *
 * WHY THIS EXISTS
 *
 * `security:compat` has had THREE separate blindness bugs. Every one of them
 * reported COMPATIBLE while not looking at the thing that had changed, and NOT
 * ONE was found by reading the code:
 *
 *   · it parsed zero enums and said COMPATIBLE      — caught by agent 4
 *   · it read 40 of 42 keys and said COMPATIBLE     — caught by Conversion's
 *                                                     number disagreeing
 *   · its key charset excluded uppercase, so any
 *     camelCase key was invisible                   — caught by mutating a key
 *
 * Conversion then ran the same method against their own suite and found the
 * mirror: a pinned key list that built a payload with no business enquiry, so
 * the conditionally-spread pair's spelling was never checked. Same blindness,
 * different mechanism.
 *
 * Their diagnosis is the reason this file is a script rather than a habit:
 *
 *   A guard encodes the shape of the code AT THE MOMENT IT WAS WRITTEN, and the
 *   next field added is the one most likely to fall outside that shape. So a
 *   guard is most trustworthy about the code it was written against, and least
 *   trustworthy about exactly what it will next be asked to catch.
 *
 * Which means re-mutating belongs at every field addition, not every checker
 * rewrite. A forty-second manual ritual that depends on remembering is not a
 * control — that is the NEVER_WRITTEN lesson in process form. So: one command.
 *
 * THE NEGATIVE CONTROL IS NOT OPTIONAL. A checker that failed on everything
 * would pass every mutation below and be useless. The unmutated tree must
 * report COMPATIBLE first, or nothing after it means anything.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLIENT = process.argv[2] || join(process.cwd(), '..', 'zuca-growth');
const API = 'src/components/waitlist/api.js';
const FIELDS = 'src/components/waitlist/fields.js';

/**
 * Each mutation is a defect a real person could plausibly ship. `businessEnquiry`
 * is not invented: it is the parameter name in Conversion's own buildPayload
 * signature, four lines above the wire key it maps to. camelCase is that
 * codebase's natural style and snake_case is our deliberate exception, so both
 * spellings live in one function and only one is correct on the wire. Not a
 * mistake waiting to be made carelessly — one waiting to be made fluently.
 */
const MUTATIONS = [
  ['conditional key camelCased', API, /business_enquiry: true/, 'businessEnquiry: true'],
  // The SINGLE-LINE spread shape. The mutation above targets a key on its own
  // line inside a multi-line ternary; this one shares its line with the spread,
  // which is a different shape and was invisible to the extractor until
  // 2026-08-19. Both shapes are in the client, so both need a mutation.
  ['inline-spread key camelCased', API, /edit_token: edit/, 'editToken: edit'],
  ['conditional key misspelled', API, /business_consent_text_version: str\(/, 'business_consent_text_versionn: str('],
  ['unconditional key camelCased', API, /^(\s+)referral_source: /m, '$1referralSource: '],
  ['unconditional key renamed', API, /^(\s+)quantity_band: /m, '$1quantity_bands: '],
  ['a wholly new unknown key', API, /^(\s+)flavor: /m, '$1surprise_field: null,\n$1flavor: '],
  ['an enum value drifts', FIELDS, /"srv_3_5"/, '"srv_3_6"'],
  // A client cap ABOVE the server's is not a laxer client — it is a 400 for
  // every answer that lands in the gap. 60 -> 200 against a server cap of 60.
  ['a free-text cap rises above the server', FIELDS, /export const DIETARY_OTHER_MAX = 60;/, 'export const DIETARY_OTHER_MAX = 200;'],
];

const run = (dir) => {
  try {
    return execFileSync('node', [join(process.cwd(), 'scripts/check-merge-compat.mjs'), dir],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
};
const caught = (out) => /INCOMPATIBILITY|COVERAGE FAILURE/.test(out);

/**
 * ⚠️ READ THE CEILING BEFORE TRUSTING THIS.
 *
 * A declared count catches deleting a mutation. It does NOT catch deleting a
 * mutation AND decrementing this number in the same edit — verified, that runs
 * green. Conversion measured the same thing on their side after I claimed
 * distance from the array was what made it work, and it is not: distance is a
 * speed bump, worth having because removing a check stops being a one-line
 * deletion, but it is not a control and this comment used to imply it was.
 *
 * The distinction that actually holds is derivation, not placement: A DERIVED
 * FLOOR CANNOT BE EDITED IN THE SAME MOTION BECAUSE THE SECOND READING IS NOT
 * IN THE FILE BEING EDITED. Placement is not a weak derivation; it is a
 * different thing that happens to look similar.
 *
 * So the real floor here is CATEGORY_COVERAGE below, which IS derived. This
 * count is the honest second best for "how many", and says so.
 *
 * Deleting four rows from MUTATIONS printed "All 2 mutations caught" and exited
 * 0 — the tool built to catch pass-on-nothing had pass-on-nothing. Conversion
 * found the same shape twice in their own suite on the same day and named it:
 * an assertion inside a loop is an assertion about the fixture until something
 * floors the fixture.
 *
 * A count kept beside the data it counts is not a floor — it is edited in the
 * same motion. This one is meant to be a nuisance: raising it is the moment to
 * ask whether the new mutation actually tests something, and lowering it is a
 * deliberate act that shows up in a diff on its own line.
 */
const EXPECTED_MUTATIONS = 8;

if (MUTATIONS.length !== EXPECTED_MUTATIONS) {
  console.log(`\n  ✗ MUTATION LIST CHANGED — ${MUTATIONS.length} present, ${EXPECTED_MUTATIONS} expected.`);
  console.log('    Every result below would describe a smaller check than the one this file claims.');
  console.log(`    If the change is intended, update EXPECTED_MUTATIONS to ${MUTATIONS.length}.\n`);
  process.exit(1);
}

/**
 * THE DERIVED FLOOR. `check-merge-compat.mjs` declares the kinds of drift it
 * reports — `const results = { value: [], key: [], cap: [] }` — so every one of
 * them must have at least one mutation proving it fires.
 *
 * This is a genuine second reading: it lives in the file being CHECKED, not the
 * file being edited, so adding a fourth category to the checker fails here
 * until a mutation exercises it.
 *
 * FINDING ON FIRST RUN: `cap` had NO mutation. Four key mutations, one enum,
 * and the cap check — a client free-text cap above the server's, which is a 400
 * for every answer in the gap — had never been shown a failure at all. Both of
 * us had been reading "6/6 caught" as though it meant the checker worked, when
 * a third of what it claims to check was unexercised.
 */
const CATEGORY_OF = { key: /key/i, value: /enum|value/i, cap: /cap/i };
{
  const checkerSrc = readFileSync(join(process.cwd(), 'scripts/check-merge-compat.mjs'), 'utf8');
  const declared = Object.keys(
    Object.fromEntries(
      [...(checkerSrc.match(/const results = \{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+):/g)].map((m) => [m[1], 1])
    )
  );
  if (declared.length < 2) {
    console.log(`\n  ✗ could not read the checker's result categories — the floor itself is broken.\n`);
    process.exit(1);
  }
  const uncovered = declared.filter((c) => !MUTATIONS.some(([label]) => CATEGORY_OF[c]?.test(label)));
  if (uncovered.length) {
    console.log(`\n  ✗ NO MUTATION EXERCISES: ${uncovered.join(', ')}`);
    console.log(`    check-merge-compat reports ${declared.length} kinds of drift and this file`);
    console.log(`    proves only ${declared.length - uncovered.length} of them fire.\n`);
    process.exit(1);
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'zuca-mutate-'));
let failures = 0;

try {
  console.log(`\n  mutating ${CLIENT} — ${MUTATIONS.length} mutations\n`);

  // ── negative control ──────────────────────────────────────────────────────
  const clean = join(tmp, 'clean');
  cpSync(CLIENT, clean, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.includes('/.git') });
  const base = run(clean);
  if (!/COMPATIBLE/.test(base) || caught(base)) {
    console.log('  ✗ NEGATIVE CONTROL FAILED — the unmutated tree is not reported COMPATIBLE.');
    console.log('    Every result below would be meaningless. Fix the drift first.\n');
    console.log(base.split('\n').filter(Boolean).slice(-4).map((l) => '    ' + l).join('\n'));
    process.exit(1);
  }
  console.log('  ✓ negative control — unmutated tree reports COMPATIBLE\n');

  for (const [label, file, find, replace] of MUTATIONS) {
    const dir = join(tmp, label.replace(/\W+/g, '-'));
    cpSync(CLIENT, dir, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.includes('/.git') });
    const path = join(dir, file);
    const src = readFileSync(path, 'utf8');
    const next = src.replace(find, replace);
    if (next === src) {
      // A mutation that did not apply is NOT a pass. It means the code moved
      // and this mutation now tests nothing — the same silent-drift failure
      // the whole file is about.
      console.log(`  ✗ ${label.padEnd(32)} MUTATION DID NOT APPLY — pattern no longer matches ${file}`);
      failures++;
      continue;
    }
    writeFileSync(path, next);
    const out = run(dir);
    if (caught(out)) {
      console.log(`  ✓ ${label.padEnd(32)} caught`);
    } else {
      console.log(`  ✗ ${label.padEnd(32)} SURVIVED — security:compat reported no problem`);
      failures++;
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(
  failures
    ? `\n  ${failures} MUTATION(S) SURVIVED. security:compat is blind to them — do not trust it until fixed.\n`
    : `\n  All ${MUTATIONS.length} mutations caught. security:compat sees what it claims to.\n`
);
process.exit(failures ? 1 : 0);
