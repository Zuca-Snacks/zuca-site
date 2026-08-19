/**
 * Enum parity gate — run the merge candidate's CLIENT field definitions through
 * the merge candidate's SERVER schema, in one pass, from the real modules.
 *
 * WHY THIS EXISTS
 * On 18 Aug an integration branch reached a state where all ten values its
 * quantity and price chips could emit were rejected by the schema on the same
 * branch. Nobody's edit was wrong: growth had switched the client, security had
 * narrowed the schema, and each verified against the other's BRANCH. The
 * integration branch had one half. Neither diff showed it — you could only see
 * it by running one side against the other.
 *
 * It was a hard block, not degraded data: Step2Profile saves on every advance
 * and refuses to advance on failure, so a visitor who answered the first
 * question could not reach screens 2, 3 or 4.
 *
 * The downgrade ladder could not catch it either. Both fields are in CORE, and
 * the rungs strip KEYS — these were bad VALUES in keys every rung keeps.
 *
 * WHY IT IMPORTS RATHER THAN GREPS
 * Two hand-rolled extractors got this wrong the same week: one matched DIETARY
 * as a prefix of DIETARY_OTHER_MAX, another read past a block boundary and
 * reported an enum's neighbour as its own rejected values. The modules are the
 * only authority on what they export.
 *
 * SELF-CHECK: this script fails if it compares FEWER than MIN_PAIRS enums. A
 * parity checker that silently finds nothing to compare reports success, which
 * is the exact orientation that lets a green run mean nothing.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const MIN_PAIRS = 8;

const PAIRS = [
  ['QUANTITY_BAND', 'QUANTITY_BAND'],
  ['PRICE_BAND', 'PRICE_BAND'],
  ['FLAVOR', 'FLAVOR'],
  ['INTENT', 'INTENT'],
  ['REFERRAL_SOURCE', 'REFERRAL_SOURCE'],
  ['MOTIVATION', 'MOTIVATION'],
  ['DIETARY', 'DIETARY'],
  ['CHANNEL', 'CHANNEL'],
  ['OFFICE_INTEREST', 'OFFICE_INTEREST'],
  ['COMPANY_HEADCOUNT', 'HEADCOUNT'],
];

const load = (p) => import(pathToFileURL(resolve(p)).href);
const fields = await load('src/components/waitlist/fields.js');
const schema = await load('src/lib/validation.js');

let compared = 0;
let failed = 0;
const skipped = [];

for (const [clientKey, serverKey] of PAIRS) {
  const client = fields[clientKey]?.options?.map((o) => o.value);
  const server = schema[serverKey] ?? schema[`${serverKey}S`] ?? null;

  if (!Array.isArray(client) || !Array.isArray(server)) {
    skipped.push(`${clientKey} (client=${client ? client.length : 'missing'}, server=${server ? server.length : 'missing'})`);
    continue;
  }

  compared += 1;
  const rejected = client.filter((v) => !server.includes(v));
  if (rejected.length) {
    failed += 1;
    console.log(`  ✗ ${clientKey.padEnd(18)} the server would 400 on: ${rejected.join(', ')}`);
  } else {
    console.log(`  ✓ ${clientKey.padEnd(18)} ${client.length} client values, all accepted`);
  }
}

if (skipped.length) {
  console.log(`\n  not compared: ${skipped.join(' · ')}`);
}

// The instrument check. A run that compared almost nothing is not a pass.
if (compared < MIN_PAIRS) {
  console.log(`\n  ✗ ONLY ${compared} ENUM PAIRS COMPARED, expected at least ${MIN_PAIRS}.`);
  console.log('    Treat this as a failure: either a rename broke the pairing above, or');
  console.log('    the modules moved. A parity check that finds nothing reports success.');
  process.exit(1);
}

if (failed) {
  console.log(`\n  ✗ ${failed} of ${compared} enums would be rejected by this branch's own schema.`);
  console.log('    A removal must land client-first; an addition must land server-first.');
  process.exit(1);
}

console.log(`\n  ✓ all ${compared} enums agree — every value the client can emit is accepted.`);
