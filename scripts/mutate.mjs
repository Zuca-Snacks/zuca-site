/**
 * Break the client on purpose and check the suite notices.
 *
 *   npm run mutate      non-zero exit if any mutation survives
 *
 * ── Why this is a script and not a habit ────────────────────────────────────
 * I costed the manual version at forty seconds and proposed doing it whenever a
 * field is added. Security's answer was better: forty seconds is cheap enough to
 * do and exactly expensive enough to skip, and a ritual that depends on
 * remembering is not a control — it is the NEVER_WRITTEN mistake wearing process
 * clothes. The argument for automating it is the finding that produced it: a
 * guard encodes the shape of the code at the moment it was written, so it is
 * least trustworthy about exactly what it will next be asked to catch.
 *
 * Four blindness bugs were found across the two repos this week. Not one was
 * found by reading. Every one came from a number disagreeing with another
 * number, or from something deliberately broken.
 *
 * ── Three rules this file follows ───────────────────────────────────────────
 * 1. THE NEGATIVE CONTROL RUNS FIRST. A suite that failed on everything would
 *    "catch" all six mutations and be worthless. If the unmutated tree is not
 *    green the run aborts and says the results below mean nothing.
 * 2. A MUTATION THAT DOES NOT APPLY IS A FAILURE, NOT A PASS. If a pattern stops
 *    matching, the code moved and that mutation now tests nothing, silently —
 *    the exact failure this file exists to prevent, so it does not get to happen
 *    inside it.
 * 3. THE MUTATIONS ARE PLAUSIBLE, NOT ARBITRARY. `businessEnquiry` is not a typo
 *    invented for a mutation: it is the parameter name in buildPayload's own
 *    signature, four lines above the wire key it maps to. Two spellings in one
 *    function, one correct on the wire. Not a mistake waiting to be made
 *    carelessly — one waiting to be made fluently.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const API = 'src/components/waitlist/api.js';
const COPY = 'src/content/copy.js';

const MUTATIONS = [
  {
    label: 'conditional key camelCased',
    why: 'strict() would reject every office signup; passed the whole suite once',
    file: API,
    find: '          business_enquiry: true,',
    with: '          businessEnquiry: true,',
  },
  {
    label: 'conditional key misspelled',
    why: 'the consent version arrives under a name the schema does not know',
    file: API,
    find: '          business_consent_text_version: str(businessConsentTextVersion, 64),',
    with: '          business_consent_version: str(businessConsentTextVersion, 64),',
  },
  {
    label: 'unconditional key camelCased',
    why: 'same drift, on a key every single submission carries',
    file: API,
    find: '    form_render_ts: typeof formRenderTs === "number" ? formRenderTs : null,',
    with: '    formRenderTs: typeof formRenderTs === "number" ? formRenderTs : null,',
  },
  {
    label: 'a new unconditional nullable key',
    why: 'strict() rejects on presence, not value — a deploy window is a total outage',
    file: API,
    find: '    zip: p.zip || null,',
    with: '    zip: p.zip || null,\n    loyalty_tier: null,',
  },
  {
    label: 'business keys become unconditional',
    why: 'every personal signup starts failing against any server predating S22',
    file: API,
    find: '    ...(business\n      ? {',
    with: '    ...(true\n      ? {',
  },
  {
    label: 'business keys dropped from the floor',
    why: 'the ladder strips what made a role address legal and fails at every rung',
    file: API,
    find: '  "email", "consent_marketing", "consent_text_version",\n',
    with: '  "email", "consent_marketing", "consent_text_version",\n  // dropped\n',
    also: { find: '  "business_enquiry", "business_consent_text_version",\n]);', with: ']);' },
  },
  {
    label: 'a gated consent wording is translated',
    why: 'the server gates on the TEXT, so a translation fails closed and the path silently stops working',
    file: COPY,
    find: "I'm asking on behalf of my workplace.",
    with: 'Jeg spør på vegne av arbeidsplassen min.',
  },
  {
    label: 'the consent wording drops its exclusion promise',
    why: 'the row is excluded from the personal list but is no longer TOLD so',
    file: COPY,
    find: " Because it's a shared address, we won't add it to our personal mailing list.",
    with: '',
  },
  {
    label: 'the consent wording drops the stop mechanism',
    why: 'an opt-out only the original sender can exercise is not an opt-out for a shared inbox',
    file: COPY,
    find: ' and anyone reading this inbox can stop it by replying to that email',
    with: '',
  },
  {
    label: 'the consent wording loses its basis',
    why: 'for a shared mailbox the wording IS the legal basis — the server gate reads this text',
    file: COPY,
    find: "I'm asking on behalf of my workplace.",
    with: "I'd like to hear from you.",
  },
];

// Deliberately `npm test` and not a hand-rolled node invocation. A harness that
// runs a DIFFERENT suite than the one CI runs is itself the blindness bug this
// file exists to find — it would report six green mutations about tests nobody
// executes. `node --test test/` is not the same command and does not even pass.
const suite = () =>
  spawnSync('npm test', { encoding: 'utf8', stdio: 'pipe', shell: true }).status === 0;

console.log('negative control — the unmutated tree must be green');
if (!suite()) {
  console.error('\n✗ ABORTED: the suite is already failing.');
  console.error('  Every result below would be a false "caught". Fix the tree first.');
  process.exit(2);
}
console.log('  ✓ green\n');

let survived = 0;
for (const m of MUTATIONS) {
  const edits = [{ file: m.file, ...m }, ...(m.also ? [{ file: m.file, ...m.also }] : [])];
  const originals = new Map();
  for (const e of edits) if (!originals.has(e.file)) originals.set(e.file, readFileSync(e.file, 'utf8'));

  try {
    let applied = true;
    for (const e of edits) {
      const cur = readFileSync(e.file, 'utf8');
      if (!cur.includes(e.find)) { applied = false; break; }
      writeFileSync(e.file, cur.replace(e.find, e.with));
    }

    if (!applied) {
      // Rule 2. The code moved, so this mutation now exercises nothing — and it
      // would have reported a clean pass while doing it.
      console.log(`  ✗ ${m.label} — DID NOT APPLY; the pattern is stale and tests nothing`);
      survived += 1;
      continue;
    }

    if (suite()) {
      console.log(`  ✗ ${m.label} — SURVIVED`);
      console.log(`      ${m.why}`);
      survived += 1;
    } else {
      console.log(`  ✓ ${m.label} — caught`);
    }
  } finally {
    for (const [file, text] of originals) writeFileSync(file, text);
  }
}

console.log();
if (survived) {
  console.error(`${survived} MUTATION(S) SURVIVED. The suite is blind to them.`);
  process.exit(1);
}
console.log(`all ${MUTATIONS.length} mutations caught`);
