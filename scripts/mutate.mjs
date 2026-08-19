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

/**
 * How many defects this file is supposed to simulate.
 *
 * ⚠️ A DECLARED CONSTANT, NOT A DERIVED ONE, AND DELIBERATELY KEPT UP HERE.
 * Deleting four mutations used to print `all 8 mutations caught` and exit 0 —
 * the pass-on-nothing failure, inside the harness written to catch
 * pass-on-nothing. A count that lives beside the data it counts is not a floor:
 * it gets edited in the same motion, which is exactly how the rows went.
 *
 * Nothing else in this repo knows how many defects this file ought to simulate,
 * so there is nothing to derive from and this is the honest second best. Where a
 * second independent reading DOES exist — the payload key list, the ladder key
 * sets — the test derives instead of declaring.
 *
 * It is meant to be a nuisance. Raising it is the moment to ask whether the new
 * mutation actually tests anything; lowering it shows up on its own line.
 *
 * ⚠️ ITS CEILING, STATED RATHER THAN IMPLIED: this catches a deleted mutation.
 * It does not catch someone deleting a mutation and decrementing this number in
 * the same motion, and no placement fixes that — verified by doing exactly that
 * to the gate floor in the test suite, which still passed. A declared constant
 * buys one thing: removal stops being a single-line edit.
 */
const EXPECTED_MUTATIONS = 18;

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
    // ⚠️ THIS MUTATION USED TO BE MISLABELLED, AND THE COVERAGE REPORT FOUND IT.
    // Its pattern matched the FIRST `business_enquiry…]);` in the file, which is
    // CORE_KEYS — so a mutation named "the floor" never touched the floor, and
    // `the floor is what the server actually requires` was never exercised by
    // anything. It applied, it was caught, and it was catching the wrong test.
    // A mutation can lie about what it does while passing.
    label: 'business keys dropped from CORE',
    why: 'rung 2 strips what made a role address legal and the descent fails identically',
    file: API,
    find: '  // for every personal signup their presence here costs nothing.\n  "business_enquiry", "business_consent_text_version",\n',
    with: '  // for every personal signup their presence here costs nothing.\n',
  },
  {
    label: 'business keys dropped from the floor',
    why: 'the floor is the last rescue; a role address then has no valid form at all',
    file: API,
    find: '  // true the moment these are dropped.\n  "business_enquiry", "business_consent_text_version",\n',
    with: '  // true the moment these are dropped.\n',
  },
  {
    label: 'the edit token is dropped from the payload',
    why: 'S23 exactly: every step 2-4 save 409s, the client calls it success, the answers vanish',
    file: API,
    find: '    ...(edit ? { edit_token: edit } : {}),\n',
    with: '',
  },
  {
    label: 'the edit token is stripped by the ladder floor',
    why: 'the last rescue rung would write a duplicate-rejected 409 and report a save',
    file: API,
    find: '  // duplicate-rejected 409 and calls it saved.\n  "edit_token",\n',
    with: '  // duplicate-rejected 409 and calls it saved.\n',
  },
  {
    label: 'step 1 stops surfacing the token',
    why: 'the token is minted and discarded; steps 2-4 then have nothing to send',
    file: API,
    find: '      if (body && typeof body.edit_token === "string" && body.edit_token) editToken = body.edit_token;\n',
    with: '',
  },
  {
    label: 'the shared-inbox mirror short-circuits a submission',
    why: 'a presentation-only mirror turned into pre-validation fails optimistically when stale',
    file: 'src/components/waitlist/Step1Email.jsx',
    find: '    if (!value) {',
    with: '    if (looksLikeRoleAddress(value)) { return; }\n    if (!value) {',
  },
  {
    label: 'the business consent id loses its region token',
    why: '`all` once parsed as an unknown regime and left every record unauditable',
    file: 'src/components/waitlist/consent.js',
    find: 'return { text: entry.text, version: version("biz", "eea", entry) };',
    with: 'return { text: entry.text, version: version("biz", "all", entry) };',
  },
  {
    label: 'sendBeacon appears where the old scan could not see it',
    why: 'the scan read only the form directory; analytics.js is where it would actually be written',
    file: 'src/lib/analytics.js',
    find: 'export const EVENTS = {',
    with: 'const _u = () => navigator.sendBeacon("/api/x");\nexport const EVENTS = {',
  },
  {
    label: 'a gate is deleted from the list the test iterates',
    why: 'a loop over a list measures the list; dropping the Art 9 row passed 28/28 in silence',
    file: 'test/failure-paths.test.mjs',
    find: "    ['motivation', consentTexts.motivation.text,",
    with: "    ['motivation_DELETED', consentTexts.motivation.text,",
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
if (MUTATIONS.length !== EXPECTED_MUTATIONS) {
  console.error(`✗ ABORTED: ${MUTATIONS.length} mutations defined, ${EXPECTED_MUTATIONS} expected.`);
  console.error('  Update EXPECTED_MUTATIONS deliberately, or restore what was removed.');
  process.exit(2);
}

// Returns { ok, failed } — WHICH tests failed, not merely whether any did.
// "Do my mutations pass?" and "what do my mutations exercise?" are different
// questions, and only the first was ever being asked here.
const suite = () => {
  const r = spawnSync('npm test', { encoding: 'utf8', stdio: 'pipe', shell: true });
  const failed = new Set();
  const all = new Set();
  for (const line of (r.stdout || '').split('\n')) {
    const m = /^\s*[\u2714\u2716] (.+?) \(\d/.exec(line);
    if (!m || m[1] === 'test' || m[1].endsWith('.test.mjs')) continue;
    all.add(m[1]);
    if (line.includes('\u2716')) failed.add(m[1]);
  }
  return { ok: r.status === 0, failed, all };
};

console.log('negative control — the unmutated tree must be green');
const control = suite();
if (!control.ok) {
  console.error('\n✗ ABORTED: the suite is already failing.');
  console.error('  Every result below would be a false "caught". Fix the tree first.');
  process.exit(2);
}
console.log('  ✓ green\n');

let survived = 0;
const exercised = new Set();
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

    const { ok, failed } = suite();
    for (const t of failed) exercised.add(t);
    if (ok) {
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

// ── Coverage, not just outcome ──────────────────────────────────────────────
// "Do my mutations pass?" and "what do my mutations exercise?" are different
// questions and only the first was being asked. Asking the second found a
// mutation labelled "dropped from the floor" that had only ever edited CORE —
// so `the floor is what the server actually requires` had never once been shown
// a failure, while the run reported all mutations caught.
//
// The unexercised list is PRINTED rather than floored with another constant.
// Most of these are behavioural tests that construct their own failure (they
// stub a 404, a 413, an offline fetch) and are self-exercising by design. The
// ones worth looking at are STATIC assertions — a regex over source, a pinned
// list, a shape check — because those pass forever if written wrong, and
// nothing else will ever tell them so.
console.log(`\n${exercised.size} of ${control.all.size} test(s) exercised by these mutations:`);
for (const t of [...exercised].sort()) console.log(`    ${t}`);

const untouched = [...control.all].filter((t) => !exercised.has(t)).sort();
console.log(`\n${untouched.length} never shown a failure by any mutation:`);
for (const t of untouched) console.log(`    ${t}`);
console.log('  (behavioural tests stub their own failures; a STATIC assertion here is a gap)');

console.log();
if (survived) {
  console.error(`${survived} MUTATION(S) SURVIVED. The suite is blind to them.`);
  process.exit(1);
}
console.log(`all ${MUTATIONS.length} mutations caught`);
