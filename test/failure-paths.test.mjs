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

const payload = (over = {}) => ({
  email: 'a@b.com', consent_marketing: true, consent_health: false,
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
  assert.equal(q[0].payload.email, 'a@b.com');
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
      'consent_text_version', 'email'],
    'the floor must stay irreducible',
  );
});

test('queued entries record the schema generation they were written under', async () => {
  const { mod, store } = await withFetch(async () => { throw new TypeError('offline'); }, false);
  await mod.submitWaitlist(payload());
  const [entry] = queued(store);
  assert.equal(entry.meta.schema, mod.SCHEMA_GENERATION,
    'a stale replay should be recognisable, not merely unlucky');
  assert.equal(entry.payload.email, 'a@b.com');
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
  assert.equal(landed.email, 'a@b.com');
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
  const clean = mod.buildPayload({ email: 'A@B.com ', consentMarketing: true });
  assert.equal(clean.email, 'a@b.com', 'trim and lowercase still apply');
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
  const dir = new URL('../src/components/waitlist/', import.meta.url);
  const hits = readdirSync(dir)
    .filter((f) => /\.(js|jsx)$/.test(f))
    .filter((f) => /sendBeacon\s*\(/.test(readFileSync(new URL(f, dir), 'utf8')));
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
  // And the narrowing that makes the basis lawful at all.
  assert.match(text, /replying/i, 'the inbox must be told how to stop it');
  assert.match(text, /not|won't/i, 'and told it is excluded from the personal list');
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
  assert.equal(looksLikeRoleAddress('office@bakeriet.no'), true);
  assert.equal(looksLikeRoleAddress('INFO@Bakeriet.no'), true);
  assert.equal(looksLikeRoleAddress('sarah@bakeriet.no'), false);
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
