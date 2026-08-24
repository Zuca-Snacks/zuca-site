/**
 * Failure-path tests for the waitlist client.
 *
 * WHY THESE EXIST. The client used to answer every failed fetch with "You look
 * offline. We've saved your email and we'll send it the moment you're back."
 * A 404, a 5xx, or a missing env var in production all produced that sentence
 * — reassuring, specific, and false. The address was not saved and the person
 * had no reason to try again.
 *
 * The rule these lock down: ONLY a genuine offline state may claim the address
 * is saved, because it is the only case we actually queue.
 *
 * Run: node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const API = '../src/components/waitlist/api.js';

/** Fresh module per case — the queue and RESULT are module state. */
async function withFetch(impl, online = true) {
  globalThis.fetch = impl;
  // navigator is getter-only on modern Node; assignment throws.
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online }, configurable: true, writable: true,
  });
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: { search: '', pathname: '/' },
    dispatchEvent: () => {},
    setTimeout,
  };
  const mod = await import(`${API}?t=${Math.random()}`);
  return { mod, store };
}

// The elements security's gates require. `motivation` is the Art 9 health
// wording and is the row whose silent removal costs the most.
//
// ⚠️ THIS CATCHES A DELETED ROW. IT DOES NOT CATCH A COORDINATED EDIT, AND
// MOVING IT UP HERE DID NOT CHANGE THAT — measured, not assumed: deleting a
// GATES row together with its label here still passes 28/28. Distance is a
// speed bump, not a control. It buys exactly one thing, which is that removing
// a gate can no longer happen as a single-line deletion.
//
// The only real defence is a SECOND INDEPENDENT READING, and for the payload
// keys and the ladder key sets there is one, so those tests derive. For the
// element list there is none short of importing security's repo, which would
// make this suite depend on their worktree sitting beside ours. So this is a
// declared constant and it is worth being plain about its ceiling rather than
// letting its placement imply a strength it does not have.
const GATED_ELEMENTS = [
  'business/basis', 'business/exclusion', 'business/exclusion-negation',
  'business/stop', 'motivation',
];

const payload = (over = {}) => ({
  email: 'a@example.com', consent_marketing: true, consent_health: false,
  consent_text_version: 'mkt-us-2026-08-15-7d912cf1', ...over,
});

const json = (status, body = {}) => async () => ({
  status, json: async () => body,
});

/** Queue length, treating "absent" and "empty array" as the same thing. */
const queued = (store) => {
  const raw = store.get('zuca_waitlist_queue_v1');
  return raw ? JSON.parse(raw) : [];
};

test('404 → server ("our end broke"), never offline', async () => {
  const { mod } = await withFetch(json(404));
  const r = await mod.submitWaitlist(payload());
  assert.equal(r.status, mod.RESULT.SERVER);
  assert.notEqual(r.status, mod.RESULT.OFFLINE);
});

test('500 → server ("our end broke"), never offline', async () => {
  const { mod } = await withFetch(json(500));
  const r = await mod.submitWaitlist(payload());
  assert.equal(r.status, mod.RESULT.SERVER);
  assert.notEqual(r.status, mod.RESULT.OFFLINE);
});

test('404 and 500 do NOT queue — nothing was saved, so nothing may be replayed', async () => {
  for (const status of [404, 500]) {
    const { mod, store } = await withFetch(json(status));
    await mod.submitWaitlist(payload());
    assert.equal(queued(store).length, 0,
      `${status} must not enqueue: queueing is what makes "we've saved it" true`);
  }
});

test('unreachable endpoint while ONLINE → server, not offline', async () => {
  // DNS failure, CORS rejection, a missing env var — fetch throws, but the
  // person's connection is fine. This is the case that used to lie.
  const { mod, store } = await withFetch(async () => { throw new TypeError('Failed to fetch'); }, true);
  const r = await mod.submitWaitlist(payload());
  assert.equal(r.status, mod.RESULT.SERVER);
  assert.equal(queued(store).length, 0, 'nothing stored, so nothing may be replayed');
});

test('genuinely offline → offline, and IS queued', async () => {
  const { mod, store } = await withFetch(async () => { throw new TypeError('Failed to fetch'); }, false);
  const r = await mod.submitWaitlist(payload());
  assert.equal(r.status, mod.RESULT.OFFLINE);
  const q = queued(store);
  assert.equal(q.length, 1, 'the offline copy promises a replay; the queue is that promise');
  // Entries are {payload, meta} now — the meta records the schema generation
  // so a replay after an enum change is recognisable rather than merely
  // unlucky. See the drift tests below.
  assert.equal(q[0].payload.email, 'a@example.com');
});

test('400 → validation, distinct from both', async () => {
  const { mod } = await withFetch(json(400, { ok: false, error: 'validation' }));
  const r = await mod.submitWaitlist(payload());
  assert.equal(r.status, mod.RESULT.VALIDATION);
});

test('429 → rate_limited, distinct from both', async () => {
  const { mod } = await withFetch(json(429));
  const r = await mod.submitWaitlist(payload());
  assert.equal(r.status, mod.RESULT.RATE_LIMITED);
});

test('only the offline message may claim the address is saved', async () => {
  const { step1 } = await import('../src/content/copy.js');
  // Must match an AFFIRMATIVE claim, not the word. "your email hasn't saved
  // yet" contains "saved" and is the honest message — a naive /saved/ here
  // would fail the correct copy and pass the lie.
  const claims = /\bwe(?:'ve|'d| have| will| 'll)?\s+(?:saved|kept|got|stored)\b/i;
  assert.match(step1.errors.offline, claims, 'offline queues, so it may say so');
  assert.doesNotMatch(step1.errors.server, claims,
    'server/unreachable stores nothing — it must not imply otherwise');
  assert.doesNotMatch(step1.errors.rate_limited, claims);
});

/* ─── Schema drift: a queued payload outlives the schema it was written for ──
 *
 * "The client stopped sending that value" is not "nothing will send it again".
 * An entry queued before an enum change still carries the retired member. It
 * 400s on replay, and before the MINIMAL rung it was dequeued rather than
 * retried — losing the email silently, which is the one outcome the endpoint
 * exists to prevent. */

test('a stale queued payload still lands: the ladder has a floor', async () => {
  const seen = [];
  // Mimic the real server: reject anything carrying a retired enum member,
  // accept what is left. Only the MINIMAL rung can satisfy this.
  const { mod, store } = await withFetch(async (_url, init) => {
    const body = JSON.parse(init.body);
    seen.push(Object.keys(body));
    const stale = body.price_band === '24_29';
    return { status: stale ? 400 : 200, json: async () => ({ ok: !stale }) };
  });

  const r = await mod.submitWaitlist(payload({ price_band: '24_29' }));

  assert.equal(r.status, mod.RESULT.OK,
    'a retired enum value must not cost the signup');
  assert.ok(seen.length > 1, 'it should have climbed down rather than giving up');
  const last = seen.at(-1);
  assert.ok(last.includes('email'), 'the floor keeps the email');
  assert.ok(!last.includes('price_band'), 'the floor drops the value that failed');
  assert.equal(queued(store).length, 0, 'delivered, so nothing left queued');
});

test('the floor is what the server actually requires', async () => {
  const { mod } = await withFetch(json(200));
  assert.ok(mod.MINIMAL_KEYS.has('email'));
  assert.ok(mod.MINIMAL_KEYS.has('consent_marketing'));
  // Anything beyond email + consent is a value that could itself be rejected,
  // which would defeat the point of having a floor at all. So the floor is
  // asserted by exact membership rather than by size: a new entry fails here
  // until someone writes down why it is a PRECONDITION and not merely useful.
  //
  // The two business keys are the one justified exception. For a shared inbox
  // they are what makes the address acceptable, so dropping them does not
  // shrink the record, it destroys it — verified against zuca-sec@02d148b,
  // where a stripped business payload is refused at CORE and at MINIMAL alike.
  //
  // ⚠️ AND IT NARROWS THE FLOOR'S PROMISE, WHICH IS WORTH SAYING PLAINLY.
  // "There is always a version of the record that validates" is now true only
  // for an address the server would accept at all. A role address whose consent
  // id is unregistered has no valid form: keeping the keys fails on the wording,
  // dropping them fails on `role_address`. That is correct — we should not
  // store a shared mailbox with no basis — but it is no longer unconditional.
  assert.deepEqual(
    [...mod.MINIMAL_KEYS].sort(),
    ['business_consent_text_version', 'business_enquiry', 'consent_marketing',
      'consent_text_version', 'edit_token', 'email'],
    'the floor must stay irreducible',
  );
});

test('queued entries record the schema generation they were written under', async () => {
  const { mod, store } = await withFetch(async () => { throw new TypeError('offline'); }, false);
  await mod.submitWaitlist(payload());
  const [entry] = queued(store);
  assert.equal(entry.meta.schema, mod.SCHEMA_GENERATION,
    'a stale replay should be recognisable, not merely unlucky');
  assert.equal(entry.payload.email, 'a@example.com');
});

test('the floor still says what it discarded — a quiet loss is worse than a loud one', async () => {
  // A stale replay lands as a bare email. It must not LOOK like a bare email:
  // without downgraded_fields the floor would trade a visible failure for an
  // invisible one, which is a worse trade than the failure.
  const bodies = [];
  const { mod } = await withFetch(async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const stale = body.price_band === '24_29';
    return { status: stale ? 400 : 200, json: async () => ({ ok: !stale }) };
  });

  await mod.submitWaitlist(payload({ price_band: '24_29', flavor: 'maple_pecan' }));

  const landed = bodies.at(-1);
  assert.ok(landed.downgraded_fields, 'the record that landed must declare itself downgraded');
  assert.ok(landed.downgraded_fields.includes('price_band'),
    'and must name the field that actually caused it');
  assert.equal(landed.email, 'a@example.com');
});

test('every rung accumulates, so the floor names losses from earlier rungs too', async () => {
  const bodies = [];
  const { mod } = await withFetch(async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    // Refuse until nothing but the floor is left.
    const ok = !('flavor' in body) && !('price_band' in body);
    return { status: ok ? 200 : 400, json: async () => ({ ok }) };
  });

  await mod.submitWaitlist(payload({ price_band: '24_29', flavor: 'maple_pecan', zip: '94305' }));

  const landed = bodies.at(-1);
  for (const field of ['price_band', 'flavor']) {
    assert.ok(landed.downgraded_fields.includes(field),
      `${field} was dropped somewhere on the way down and must still be named`);
  }
});

/* ─── The count must never be invented ──────────────────────────────────────
 * /api/count can answer {"count": null} — misconfigured, unavailable, or not
 * yet set up. Null must render as nothing. The danger is not displaying null;
 * it is arithmetic quietly turning absence into a number. */

async function freshStore() {
  globalThis.window = { setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: { search: '', pathname: '/' }, dispatchEvent: () => {} };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  return import(`../src/components/waitlist/countStore.js?t=${Math.random()}`);
}

test('a signup with no loaded count does NOT invent one', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ count: null, error: 'unavailable' }) });
  const store = await freshStore();
  await store.loadCount();
  assert.equal(store.getCount().value, null, 'null from the server stays null');

  store.bumpCount();
  assert.equal(store.getCount().value, null,
    'an optimistic +1 with no base must not render as 1');

  // Let the reconcile run — this is where (count ?? 0) + pending used to
  // manufacture a 1 out of a failed request.
  await new Promise((r) => setTimeout(r, 2700));
  assert.equal(store.getCount().value, null,
    'a failed reconcile must leave the count absent, not fabricate one');
});

test('a signup on top of a real count still shows the +1', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ count: 143 }) });
  const store = await freshStore();
  await store.loadCount();
  assert.equal(store.getCount().value, 143);
  store.bumpCount();
  assert.equal(store.getCount().value, 144, 'the optimistic bump is the point when there IS a base');
});

/* ─── A rejected address must say so ────────────────────────────────────────
 * The client regex is deliberately permissive — the server is the authority —
 * so it passes role addresses, disposable domains and control characters the
 * server then rejects. Falling through to the `server` copy tells someone with
 * a normal-LOOKING address that nothing is wrong with it. */

test('400 maps to its own message, never the "our end" one', async () => {
  const { step1 } = await import('../src/content/copy.js');
  assert.ok(step1.errors.validation, 'RESULT.VALIDATION needs a message of its own');
  assert.notEqual(step1.errors.validation, step1.errors.server,
    'a rejected address is the visitor\'s to fix; "our end" says it is not');
  assert.match(step1.errors.validation, /address|email/i, 'it should name what to look at');
});

test('the email is NOT control-stripped — repairing an identifier is worse than rejecting it', async () => {
  const { mod } = await withFetch(json(200));
  const dirty = `a${String.fromCharCode(7)}@b.com`;
  const body = mod.buildPayload({ email: dirty, consentMarketing: true });
  // Stripping here would turn one address into a DIFFERENT, valid one and then
  // mail it — an accuracy failure wearing a convenience costume. Free-text
  // fields are cosmetic; an identifier is not.
  assert.ok(body.email.includes(String.fromCharCode(7)),
    'the control character must survive so the server can reject the address');
  const clean = mod.buildPayload({ email: 'A@Example.com ', consentMarketing: true });
  assert.equal(clean.email, 'a@example.com', 'trim and lowercase still apply');
});

test('a double-dot typo is named as a typo, not as a policy rejection', async () => {
  const { step1 } = await import('../src/content/copy.js');
  assert.ok(step1.errors.typo, 'the commonest email typo deserves its own message');
  assert.match(step1.errors.typo, /typo|double dot/i);
  // The server rejects ".." as a generic validation failure and its 400 body is
  // {ok, error} only — the rule name goes to its audit log, not to us. So this
  // has to be caught client-side or the person gets told about shared inboxes.
  assert.notEqual(step1.errors.typo, step1.errors.validation);
});

test('413 climbs the ladder — "do not retry unchanged" means change it', async () => {
  const sizes = [];
  const { mod } = await withFetch(async (_url, init) => {
    const body = init.body;
    sizes.push(body.length);
    // Refuse anything still carrying the optional fields, as an over-cap body would.
    const big = JSON.parse(body).flavor != null;
    return { status: big ? 413 : 200, json: async () => ({ ok: !big }) };
  });

  const r = await mod.submitWaitlist(payload({ flavor: 'maple_pecan', company: 'Acme' }));

  assert.equal(r.status, mod.RESULT.OK, 'a 413 must not cost the signup');
  assert.ok(sizes.length > 1, 'it should have descended rather than returning the 413');
  assert.ok(sizes.at(-1) < sizes[0], 'and the retry must actually be SMALLER — that is the remedy');
});

test('there is no sendBeacon in the client', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');

  // ⚠️ SCANS ALL OF src/, NOT JUST THE FORM — AND COUNTS WHAT IT SCANNED.
  // This used to read `src/components/waitlist/` only, which left out
  // `src/lib/analytics.js`: the single most likely place anyone would reach for
  // sendBeacon, since firing an event on unload is the textbook use for it.
  // A scan that finds nothing and a scan that looked nowhere both print "no
  // hits" — so the file count is asserted before the result is believed.
  const root = new URL('../src/', import.meta.url);
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const child = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    return e.isDirectory() ? walk(child) : [child];
  });
  const files = walk(root).filter((f) => /\.(js|jsx)$/.test(f.pathname));
  assert.ok(files.length >= 20, `only ${files.length} files scanned — the walk is not reaching src/`);
  assert.ok(
    files.some((f) => f.pathname.endsWith('/lib/analytics.js')),
    'analytics.js must be in scope — it is where sendBeacon would actually be written',
  );

  const hits = files
    .filter((f) => /sendBeacon\s*\(/.test(readFileSync(f, 'utf8')))
    .map((f) => f.pathname.split('/src/')[1]);
  // sendBeacon posts text/plain, which earns a 415 — a status the ladder does
  // not climb. A queue flushed with it drops signups inside the mechanism
  // built to stop signups being dropped.
  assert.deepEqual(hits, [], 'sendBeacon would make queue flushes fail as 415');
});

// ─── S22: the business basis for shared inboxes ──────────────────────────────

test('the business wording still contains the phrases the server gates on', async () => {
  const { consentTexts } = await import('../src/content/copy.js');
  const text = consentTexts.business.text;
  // Mirrors security's consentCoversBusiness(). The wording IS the legal basis
  // for a shared mailbox — there is no individual's consent underneath to fall
  // back on — so an edit that drops these phrases must fail here rather than
  // silently start refusing every office signup in production.
  assert.match(text, /\bon behalf of\b|\bworkplace\b|\bbusiness (?:enquiry|inquiry)\b/i);

  // ⚠️ THE LINE ABOVE IS NOT ENOUGH, AND A MUTATION PROVED IT.
  // It is an alternation, so the wording can lose the first-person assertion of
  // the basis and still match on a phrase further down. Replacing "I'm asking on
  // behalf of my workplace" with "I'd like to hear from you" passed both this
  // test AND security's server gate — leaving a shared mailbox signed up on a
  // sentence that asserts nothing about the organisation, which is the one thing
  // that made it lawful.
  //
  // So each load-bearing element is asserted separately. This wording is not
  // ordinary copy: it was approved by Emil, it is flagged for Cooley review, and
  // an edit that trips these should be a deliberate act with sign-off behind it.
  assert.match(text, /\bon behalf of\b/i, 'the person must assert they act for the organisation');
  assert.match(text, /\bbusiness enquiry\b/i, 'and that it is named as one, not a personal signup');
  assert.match(text, /stop it by replying/i, 'whoever reads the inbox must be able to end it');
  assert.match(text, /personal mailing list/i, 'and the exclusion must be stated to them, not merely enforced');
});

test('every gated consent wording stays in the language the server reads', async () => {
  const { consentTexts } = await import('../src/content/copy.js');

  // ⚠️ TWO CONSENTS ARE GATED ON THEIR TEXT, AND THE GATES ARE ENGLISH.
  // The server does not check a flag for these, it checks that the sentence the
  // person read actually says the thing — which is right, and which makes the
  // check language-bound by construction. It is not fixable with a better
  // regex. "Jeg spør på vegne av arbeidsplassen min" is a perfectly good
  // consent and matches nothing.
  //
  // It fails CLOSED — nothing unlawful is stored — but from a translator's seat
  // the office path and the health opt-in simply stop working, with a rejection
  // that names a rule they cannot find in the copy they just wrote.
  //
  // So this test exists to fail at the moment somebody translates one, rather
  // than after it ships. If that is you: the fix is a decision, not an edit —
  // either a per-language element list on the server or a structured claim the
  // copy declares alongside its text. Ask security before shipping the string.
  // Transcribed from zuca-sec@114109d — `businessConsentGaps` (three elements,
  // ALL required) and `consentCoversMedication`. They pin these patterns on
  // their side and will tell us if they change, because a transcribed value is
  // a copy that can go stale silently.
  //
  // ⚠️ IT ALREADY DID, INSIDE ONE EXCHANGE. The first version of this test
  // transcribed `consentCoversBusiness` — a single alternation that had ALREADY
  // been replaced by the conjunction below when I copied it, because I copied
  // from my earlier reading of their file instead of re-reading the file. Note
  // also `\bworkplace\b` narrowing to `\bmy workplace\b`: a wording could have
  // passed this test and been refused by the server. That is the whole argument
  // for their pin, demonstrated by me rather than argued at me.
  const GATES = [
    ['business/basis', consentTexts.business.text, /\bon behalf of\b|\bmy workplace\b|\bbusiness (?:enquiry|inquiry)\b/i],
    ['business/exclusion', consentTexts.business.text, /\bmailing list\b/i],
    ['business/exclusion-negation', consentTexts.business.text, /\b(?:won'?t|will not|never|not)\b/i],
    ['business/stop', consentTexts.business.text, /\brepl(?:y|ying)\b|\bunsubscribe\b|\bstop\b/i],
    ['motivation', consentTexts.motivation.text, /\bmedicat|\bGLP-?\s?1\b/i],
  ];
  // ⚠️ FLOORED, BECAUSE A LOOP OVER A LIST MEASURES THE LIST AND NOT THE WORLD.
  // Without this, deleting rows from GATES passed the whole suite in silence —
  // including the `motivation` row, which is the ONLY check on the Art 9 health
  // wording. "5 gates, all matched" and "3 gates, all matched" print the same
  // word. Zero was never the risk; fewer than you think is.
  //
  // So the coverage is declared separately from the data being iterated. Adding
  // an element to security's gate means adding it here, deliberately, rather
  // than the suite quietly continuing to report success about the old set.
  assert.deepEqual(GATES.map(([name]) => name).sort(), GATED_ELEMENTS,
    'a gate went missing from the list this test iterates');

  for (const [name, text, gate] of GATES) {
    assert.match(text, gate, `${name}: the server's gate cannot read this wording`);
  }
});

test('the business keys survive every rung of the downgrade ladder', async () => {
  const mod = await import('../src/components/waitlist/api.js');
  for (const [name, set] of [['CORE', mod.CORE_KEYS], ['MINIMAL', mod.MINIMAL_KEYS]]) {
    // Verified against zuca-sec@02d148b: strip these and the retry fails on
    // `role_address` at every rung, so the ladder converts a recoverable 400
    // into a guaranteed one. For a shared inbox they are not optional data,
    // they are the precondition of the address being accepted.
    assert.ok(set.has('business_enquiry'), `${name} must keep business_enquiry`);
    assert.ok(set.has('business_consent_text_version'), `${name} must keep the version`);
  }
});

test('a personal signup carries no business keys at all', async () => {
  const mod = await import('../src/components/waitlist/api.js');
  const p = mod.buildPayload({ email: 'sarah@example.com', consentMarketing: true,
    consentTextVersion: 'mkt-us-2026-08-15-00000000', formRenderTs: Date.now() - 9000 });
  // The server stores consent_marketing FALSE for any row where business_enquiry
  // is true. Sending it speculatively would unsubscribe people who never asked.
  assert.equal('business_enquiry' in p, false);
  assert.equal('business_consent_text_version' in p, false);
});

test('the shared-inbox mirror decides presentation, never permission', async () => {
  const { looksLikeRoleAddress } = await import('../src/components/waitlist/roleAddress.js');
  assert.equal(looksLikeRoleAddress('office@bakeriet.example'), true);
  assert.equal(looksLikeRoleAddress('INFO@Bakeriet.example'), true);
  assert.equal(looksLikeRoleAddress('sarah@bakeriet.example'), false);
  assert.equal(looksLikeRoleAddress(''), false);
  assert.equal(looksLikeRoleAddress(null), false);
  // The point of the file: it must not be reachable from the submit path as a
  // gate. If this ever grows a "return early" caller, the mirror has become
  // pre-validation and a stale copy starts refusing addresses the server takes.
  const { readFileSync } = await import('node:fs');
  const step1 = readFileSync(new URL('../src/components/waitlist/Step1Email.jsx', import.meta.url), 'utf8');
  assert.equal(/looksLikeRoleAddress\([^)]*\)\s*\)?\s*(return|\{\s*return)/.test(step1), false,
    'the mirror must never short-circuit a submission');
});

test('the business consent id keeps its purpose and region tokens', async () => {
  const { businessConsent } = await import('../src/components/waitlist/consent.js');
  // The server reads the regime off this token. `all` once parsed as `unknown`
  // and left every Art 9 record unauditable by regime — same trap, same shape.
  // The hash is deliberately NOT pinned: editing the wording SHOULD move it,
  // and their generator rebuilds from this file, so the two cannot drift.
  assert.match(businessConsent().version, /^biz-eea-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
});

test('an empty signup sends no key a deployed server has not seen', async () => {
  const mod = await import('../src/components/waitlist/api.js');
  const keys = Object.keys(mod.buildPayload({
    email: 'a@example.com', consentMarketing: true, consentTextVersion: 'x',
    formRenderTs: Date.now() - 9000,
  })).sort();

  // ⚠️ THE UNSTATED SECOND HALF OF THE ORDERING RULE.
  // `waitlistSchema` is .strict(), and strict rejects on key PRESENCE, not on
  // value — so `newfield: null` from a client whose server predates the field
  // is not "ignored", it is `Unrecognized key` and a 400 for EVERY submission.
  // ADD-goes-server-first is therefore only half the rule; the other half is
  // that the client must not emit the key until that server is actually
  // deployed. A half-merge holds that window open indefinitely.
  //
  // Verified against sec@8d6bf01, the real pre-S22 schema: this exact payload
  // is ACCEPTED, and the same payload with `business_enquiry: false` added is
  // rejected outright. That one-key difference is a working form versus a
  // total outage, and the value being false changes nothing.
  //
  // So: every key here is one an already-deployed server accepts. A new field
  // must either land here only after its server is live, or — better, and what
  // the business keys do — be omitted entirely unless it carries a value.
  // If this list changed, that is the question to answer before relaxing it.
  assert.deepEqual(keys, [
    'address_city', 'address_country', 'address_line1', 'address_line2',
    'address_postal_code', 'address_region', 'channel', 'channel_other',
    'company', 'consent_health', 'consent_marketing', 'consent_postal',
    'consent_sms', 'consent_text_version', 'dietary', 'dietary_other', 'email',
    'flavor', 'form_render_ts', 'headcount', 'hp_field', 'intent',
    'is_clinician', 'motivation', 'motivation_consent_text_version',
    'motivation_other', 'name', 'office_interest', 'page_path', 'phone',
    'postal_consent_text_version', 'price_band', 'price_band_other',
    'quantity_band', 'referral_source', 'referral_source_other',
    'research_optin', 'sms_consent_text_version', 'utm', 'zip',
  ]);
  // And the business keys must NOT be among them — the whole point.
  assert.equal(keys.some((k) => k.startsWith('business_')), false);
});

test('the conditional keys are spelled the way the server spells them', async () => {
  const mod = await import('../src/components/waitlist/api.js');
  const { businessConsent } = await import('../src/components/waitlist/consent.js');
  const keys = Object.keys(mod.buildPayload({
    email: 'office@bakeriet.example', consentMarketing: true, consentTextVersion: 'x',
    businessEnquiry: true, businessConsentTextVersion: businessConsent().version,
    formRenderTs: Date.now() - 9000,
  }));

  // ⚠️ THE TEST ABOVE CANNOT SEE THESE, AND THAT IS THE POINT OF THIS ONE.
  // It builds a payload with no business enquiry, so the conditionally-spread
  // pair never exists in it and their SPELLING is never checked. Renaming the
  // wire key to `businessEnquiry` passed the whole suite silently — proven by
  // mutation, not by reading. Conditional keys are the newest and most
  // drift-prone in any payload and they are exactly the ones a test that
  // exercises the default path will never reach.
  //
  // camelCase is this codebase's natural style and snake_case is the deliberate
  // exception for wire keys, so this is the likeliest drift there is: strict()
  // would reject the payload outright and every office signup would fail.
  assert.ok(keys.includes('business_enquiry'), 'snake_case, as the server spells it');
  assert.ok(keys.includes('business_consent_text_version'));
  assert.equal(keys.some((k) => /[A-Z]/.test(k)), false, 'no wire key is camelCase');
});

// ─── S23: the world the harness could not express ────────────────────────────
// Every fetch stub above is STATELESS, so "the same person submits twice" —
// the single most ordinary thing this form does — was not merely untested, it
// was unreachable. Two hundred passing tests across both repos could not see a
// bug that discarded every step 2-4 answer in production.
//
// So this stands up a server that REMEMBERS, and asserts on what it ended up
// storing rather than on what the client was told. That inversion is the whole
// point: the client was told "saved" the entire time.

/** A server that marks an address on first sight, as the real one does. */
function statefulServer({ issueToken = true } = {}) {
  const rows = new Map();
  const calls = [];
  const fetchImpl = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const handle = body.email;
    const known = rows.has(handle);

    if (known && body.edit_token === `edit.${handle}.valid`) {
      Object.assign(rows.get(handle), body); // merge, as updateRow_ does
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (known) return { ok: false, status: 409, json: async () => ({ ok: false, error: 'duplicate' }) };

    rows.set(handle, { ...body });
    return {
      ok: true, status: 200,
      json: async () => ({ ok: true, position: 144, ...(issueToken ? { edit_token: `edit.${handle}.valid` } : {}) }),
    };
  };
  return { fetchImpl, rows, calls };
}

const step2Profile = { flavor: 'maple_pecan', intent: 'preorder_now', price_band: '35_44' };

test('S23: a four-screen signup ends with the answers ON THE SERVER', async () => {
  const srv = statefulServer();
  const { mod } = await withFetch(srv.fetchImpl);

  const one = await mod.submitWaitlist(mod.buildPayload({
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1', formRenderTs: Date.now() - 9000,
  }));
  assert.equal(one.status, mod.RESULT.OK);
  assert.ok(one.editToken, 'step 1 must surface the token, or steps 2-4 cannot update');

  for (const screen of [1, 2, 3]) {
    const r = await mod.submitWaitlist(mod.buildPayload({
      email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1',
      editToken: one.editToken, profile: step2Profile, formRenderTs: Date.now() - 9000,
    }));
    assert.equal(r.status, mod.RESULT.OK, `screen ${screen} must be accepted as an update`);
  }

  // The assertion that matters. Not "the client saw 200" — the client saw 200
  // throughout S23 while every answer was thrown away.
  const row = srv.rows.get('sarah@example.com');
  assert.equal(row.flavor, 'maple_pecan', 'the flavor answer must have reached the server');
  assert.equal(row.intent, 'preorder_now');
  assert.equal(row.price_band, '35_44');
  assert.equal(srv.rows.size, 1, 'one row, not four — an update, not four appends');
});

test('S23: without the token the save is a 409 and the answers are LOST', async () => {
  // The pre-fix behaviour, pinned so the regression is loud rather than silent.
  const srv = statefulServer({ issueToken: false });
  const { mod } = await withFetch(srv.fetchImpl);

  await mod.submitWaitlist(mod.buildPayload({
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1', formRenderTs: Date.now() - 9000,
  }));
  const r = await mod.submitWaitlist(mod.buildPayload({
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1',
    profile: step2Profile, formRenderTs: Date.now() - 9000,
  }));

  // ⚠️ THIS IS THE SHAPE OF THE BUG, AND IT IS WHY IT SURVIVED TEN DAYS.
  // A 409 maps to DUPLICATE, which Step2Profile treats as success. The client
  // is told the save worked; the row never receives a single answer.
  assert.equal(r.status, mod.RESULT.DUPLICATE, 'no token means duplicate, as before');
  // Still the null step 1 wrote — not `undefined`, because buildPayload emits
  // every unconditional key. The point stands and is sharper for it: the row
  // exists, looks complete, and holds none of the answers.
  assert.equal(srv.rows.get('sarah@example.com').flavor, null,
    'and DUPLICATE-as-success is exactly why the loss was silent');
  assert.equal(srv.calls.length, 2, 'the client did POST — it was refused, and called that success');
});

test('S23: the token survives every rung of the downgrade ladder', async () => {
  const mod = await import('../src/components/waitlist/api.js');
  // A rung that strips edit_token does not degrade the record, it deletes it
  // while reporting a save — the 409 path above, reached from inside the
  // mechanism built to rescue submissions.
  assert.ok(mod.CORE_KEYS.has('edit_token'));
  assert.ok(mod.MINIMAL_KEYS.has('edit_token'));
});

// ─── S24: a consent is a claim about something ───────────────────────────────

test('S24: ticking SMS or postal consent without the datum never leaves the client', async () => {
  const mod = await import('../src/components/waitlist/api.js');
  const base = {
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1',
    formRenderTs: Date.now() - 9000,
    smsConsentTextVersion: 'sms-v1', postalConsentTextVersion: 'mail-v1',
  };

  // The screen-4 state that cost seventeen fields: both boxes ticked, phone
  // typed, street and city typed, country Select never opened.
  const partial = mod.buildPayload({
    ...base, consentSms: true, consentPostal: true,
    profile: { phone: '+4791234567', address_line1: '1 Main St', address_city: 'Oslo', address_country: null },
  });
  assert.equal(partial.consent_postal, false, 'postal consent needs line1 + city + country');
  assert.equal(partial.address_line1, null, 'and the partial address goes with it');
  assert.equal(partial.consent_sms, true, 'but the SMS opt-in is complete and must survive');
  assert.equal(partial.phone, '+4791234567');

  // Ticked with nothing typed at all.
  const empty = mod.buildPayload({ ...base, consentSms: true, consentPostal: true, profile: {} });
  assert.equal(empty.consent_sms, false, 'an SMS opt-in with no number can never be acted on');
  assert.equal(empty.consent_postal, false);

  // Complete, and therefore claimable.
  const full = mod.buildPayload({
    ...base, consentSms: true, consentPostal: true,
    profile: { phone: '+4791234567', address_line1: '1 Main St', address_city: 'Oslo', address_country: 'NO' },
  });
  assert.equal(full.consent_sms, true);
  assert.equal(full.consent_postal, true);
});

test('S24: a refused coupled block does not cost the fields it has nothing to do with', async () => {
  const seen = [];
  const { mod } = await withFetch(async (_u, opts) => {
    const body = JSON.parse(opts.body);
    seen.push(body);
    // A server that refuses the postal block and accepts everything else — the
    // real rule, and the trigger the ladder has to survive gracefully.
    if (body.consent_postal) return { ok: false, status: 400, json: async () => ({ ok: false, error: 'validation' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });

  const r = await mod.submitWaitlist(mod.buildPayload({
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1',
    consentSms: true, consentPostal: true, formRenderTs: Date.now() - 9000,
    smsConsentTextVersion: 'sms-v1', postalConsentTextVersion: 'mail-v1',
    profile: {
      phone: '+4791234567', address_line1: '1 Main St', address_city: 'Oslo', address_country: 'NO',
      company: 'Acme', headcount: '10_49', quantity_band: 'srv_3_5', channel: ['grocery'],
      research_optin: true, office_interest: 'yes',
    },
  }));

  assert.equal(r.status, mod.RESULT.OK);
  const delivered = seen.at(-1);
  // ⚠️ THE WHOLE POINT. Before S24 the first effective rung was CORE, so this
  // retry would have dropped every extension field — company, headcount,
  // channel, quantity band, the phone — for a rejection about an address.
  assert.equal(delivered.consent_postal, undefined, 'the refused block is gone');
  assert.equal(delivered.consent_sms, true, 'the SMS block is untouched');
  assert.equal(delivered.phone, '+4791234567');
  assert.equal(delivered.company, 'Acme', 'and so is everything unrelated');
  assert.equal(delivered.headcount, '10_49');
  assert.equal(delivered.quantity_band, 'srv_3_5');
  assert.deepEqual(delivered.channel, ['grocery']);
});

// ─── S25: background saves must not revert a newer answer ────────────────────

test('S25: a slow earlier save cannot land after a faster later one', async () => {
  // The Back-button race. Screen 2 saves flavor=maple_pecan on a connection
  // that stalls; the person presses Back, changes it to both, and that save is
  // fast. Without serialisation the stale one lands last and the sheet ends up
  // holding the answer the person corrected AWAY from — silently, because
  // last-write-wins means nothing errors and nothing looks wrong.
  const landed = [];
  const delays = { maple_pecan: 120, both: 5 };
  const { mod } = await withFetch(async (_u, opts) => {
    const body = JSON.parse(opts.body);
    await new Promise((r) => setTimeout(r, delays[body.flavor] ?? 0));
    landed.push(body.flavor);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });

  const q = await import(`../src/components/waitlist/saveQueue.js?t=${Math.random()}`);
  // saveQueue imports api.js itself, so point it at the same stubbed fetch by
  // reusing the module the harness just built.
  const payload = (flavor) => mod.buildPayload({
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1',
    editToken: 'edit.x.valid', formRenderTs: Date.now() - 9000, profile: { flavor },
  });

  q.resetSaveQueue();
  q.queueSave(payload('maple_pecan'));
  q.queueSave(payload('both'));       // the correction, made while the first is in flight
  const settled = await q.settleSaves();

  assert.equal(settled.ok, true);
  // ⚠️ THE ASSERTION THAT MATTERS: the LAST thing the server saw is the
  // correction, not the answer it replaced.
  assert.equal(landed.at(-1), 'both', 'the newest answer must be the last write');
  assert.ok(!landed.includes('maple_pecan') || landed.indexOf('maple_pecan') < landed.indexOf('both'),
    'a stale save may never arrive after the newer one');
});

test('S25: only one save is ever in flight, and the newest supersedes', async () => {
  let concurrent = 0;
  let peak = 0;
  const seen = [];
  const { mod } = await withFetch(async (_u, opts) => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await new Promise((r) => setTimeout(r, 15));
    concurrent -= 1;
    seen.push(JSON.parse(opts.body).flavor);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  const q = await import(`../src/components/waitlist/saveQueue.js?t=${Math.random()}`);
  const payload = (flavor) => mod.buildPayload({
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1',
    editToken: 'edit.x.valid', formRenderTs: Date.now() - 9000, profile: { flavor },
  });

  q.resetSaveQueue();
  for (const f of ['maple_pecan', 'choc_rasp_salt', 'both', 'undecided']) q.queueSave(payload(f));
  await q.settleSaves();

  assert.equal(peak, 1, 'never more than one request on the wire');
  // Middle saves are superseded rather than sent: every payload is the full
  // accumulated profile, so an older one holds nothing the newer one lacks.
  assert.equal(seen.at(-1), 'undecided', 'the final state is what the server ends with');
  assert.ok(seen.length < 4, 'superseded saves are dropped, not queued up');
});

test('S25: a permanent background failure is reported, never swallowed', async () => {
  const { mod } = await withFetch(async () => ({
    ok: false, status: 500, json: async () => ({ ok: false }),
  }));
  const q = await import(`../src/components/waitlist/saveQueue.js?t=${Math.random()}`);
  q.resetSaveQueue();
  q.queueSave(mod.buildPayload({
    email: 'sarah@example.com', consentMarketing: true, consentTextVersion: 'v1',
    editToken: 'edit.x.valid', formRenderTs: Date.now() - 9000, profile: { flavor: 'both' },
  }));
  const settled = await q.settleSaves();
  // If this returned ok the person would reach a confirmation saying their
  // answers are saved when the server never accepted them — S23 on purpose.
  assert.equal(settled.ok, false, 'the confirmation gate must see the failure');
  assert.equal(settled.status, mod.RESULT.SERVER);
});

// ─── S26: assembling a phone number must never invent a subscriber ───────────

test('S26: a leading zero cannot become a different real number', async () => {
  const { assemblePhone } = await import('../src/components/waitlist/phone.js');

  // ⚠️ THE CASE WHERE A WRONG ANSWER LOOKS RIGHT.
  // Norway has no trunk prefix and an 8-digit plan. "0912 34 567" is nine
  // digits. Strip the zero and you invent a different subscriber; keep it and
  // you assemble +47091234567, which passes /^\+[1-9]\d{7,14}$/ and is not a
  // Norwegian number. Both outcomes are valid E.164. Only refusal is safe.
  const no = assemblePhone('NO', '0912 34 567');
  assert.equal(no.e164, undefined, 'must not assemble anything');
  assert.match(no.error, /doesn't start with 0/);

  // Denmark: same shape, and it survived the first version of this file
  // because 8 digits with the zero passes a length check.
  assert.match(assemblePhone('DK', '0912 34 56').error, /doesn't start with 0/);

  // The trunk prefix is real in the UK and must be dropped, not refused.
  assert.equal(assemblePhone('GB', '07700 900123').e164, '+447700900123');
  assert.equal(assemblePhone('GB', '7700 900123').e164, '+447700900123');

  // Italy's leading zero IS part of the number — the blanket rule would break it.
  assert.equal(assemblePhone('IT', '06 1234 5678').e164, '+390612345678');

  // The everyday case that started this: a US number typed normally.
  assert.equal(assemblePhone('US', '(555) 123-4567').e164, '+15551234567');
  assert.equal(assemblePhone('US', '555 123 4567').e164, '+15551234567');
});

test('S26: every assembled number satisfies the server rule unchanged', async () => {
  const { assemblePhone, DIAL_CODES } = await import('../src/components/waitlist/phone.js');
  // The client assembles; the server keeps verifying. Nothing here loosens it.
  for (const c of DIAL_CODES) {
    const digits = '9'.repeat(c.min);
    const r = assemblePhone(c.code, digits);
    assert.equal(r.error, null, `${c.code}: ${c.min} digits must assemble`);
    assert.match(r.e164, /^\+[1-9]\d{7,14}$/, `${c.code}: must satisfy the server's E.164 rule`);
  }
});

test('S26: the default dial country is a hint, never a silent decision', async () => {
  const { defaultDialCountry, DIAL_CODES } = await import('../src/components/waitlist/phone.js');
  const picked = defaultDialCountry();
  // Whatever it picks must be selectable, so it renders as a visible choice the
  // person can change rather than a hidden assumption.
  assert.ok(DIAL_CODES.some((c) => c.code === picked), 'the default must be in the list');
});

// ─── S28: 409 means two different things ─────────────────────────────────────

test('S28: in_flight is not duplicate, and does not read as success', async () => {
  const body = (error) => async () => ({
    ok: false, status: 409, json: async () => ({ ok: false, error }),
  });

  const dup = await withFetch(body('duplicate'));
  const d = await dup.mod.submitWaitlist(payload());
  assert.equal(d.status, dup.mod.RESULT.DUPLICATE, 'a committed signup stays a duplicate');

  const inf = await withFetch(body('in_flight'));
  const i = await inf.mod.submitWaitlist(payload());
  // ⚠️ THE LOCKOUT. Before this, both 409s became DUPLICATE and Step1Email
  // advanced with "You're already one of us." — told to a first-time signer
  // whose request had just failed, ninety seconds before a retry would have
  // worked, with no editToken and no counted signup.
  assert.equal(i.status, inf.mod.RESULT.IN_FLIGHT);
  assert.notEqual(i.status, inf.mod.RESULT.DUPLICATE);
  assert.notEqual(i.status, inf.mod.RESULT.OK, 'must never read as success');
});

test('S28: the in_flight message says "not yet", never "already"', async () => {
  const { step1 } = await import('../src/content/copy.js');
  const mod = await import('../src/components/waitlist/api.js');
  const msg = step1.errors[mod.RESULT.IN_FLIGHT];
  assert.ok(msg, 'a distinct result with no message falls through to "our end broke"');
  assert.doesNotMatch(msg, /already/i, 'the whole bug was the word "already"');
  assert.match(msg, /again/i, 'it must tell them to retry');
  // And it must not be the duplicate copy under another name.
  const { confirmation } = await import('../src/content/copy.js');
  assert.notEqual(msg, confirmation.duplicate);
});

test('S28: an unreadable 409 body keeps the old behaviour', async () => {
  // Conservative direction on purpose: a body we cannot parse must not become
  // a retry prompt for someone who really is on the list. Only an explicit
  // in_flight changes the verdict.
  const { mod } = await withFetch(async () => ({
    ok: false, status: 409, json: async () => { throw new Error('not json'); },
  }));
  const r = await mod.submitWaitlist(payload());
  assert.equal(r.status, mod.RESULT.DUPLICATE);
});
