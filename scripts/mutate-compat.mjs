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
  ['conditional key misspelled', API, /business_consent_text_version: str\(/, 'business_consent_text_versionn: str('],
  ['unconditional key camelCased', API, /^(\s+)referral_source: /m, '$1referralSource: '],
  ['unconditional key renamed', API, /^(\s+)quantity_band: /m, '$1quantity_bands: '],
  ['a wholly new unknown key', API, /^(\s+)flavor: /m, '$1surprise_field: null,\n$1flavor: '],
  ['an enum value drifts', FIELDS, /"srv_3_5"/, '"srv_3_6"'],
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

const tmp = mkdtempSync(join(tmpdir(), 'zuca-mutate-'));
let failures = 0;

try {
  console.log(`\n  mutating ${CLIENT}\n`);

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
