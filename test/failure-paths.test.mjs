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
  // which would defeat the point of having a floor at all.
  assert.ok(mod.MINIMAL_KEYS.size <= 3, 'the floor must stay irreducible');
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
