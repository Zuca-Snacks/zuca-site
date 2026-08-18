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
  assert.equal(q[0].email, 'a@b.com');
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
