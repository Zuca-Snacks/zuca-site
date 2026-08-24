#!/usr/bin/env node
/**
 * The multi-step signup, end to end, against a REAL duplicate store.
 *
 *   npm run security:repeat            # both branches
 *
 * ─── WHY THIS EXISTS, AND WHY 200 PASSING TESTS DID NOT CATCH S23 ────────────
 *
 * `scripts/attack-waitlist.mjs` runs with no Upstash configured. `isDuplicate`
 * therefore always returns false, so in the whole suite EVERY REPEAT POST LOOKS
 * LIKE A FRESH SIGNUP. The 409 branch — the one that discarded every step 2–4
 * answer in production — was not merely untested. It was UNREACHABLE.
 *
 * That is the reason a bug this size survived a week of adversarial testing on
 * this exact endpoint: the suite could not express the state in which it
 * happens. Not a missing assertion, a missing WORLD.
 *
 * So this stands up a 20-line Upstash-compatible SET NX server and drives the
 * real handler through step 1 → step 2 → step 3, twice: once with the secret
 * absent and once with it set. It prints what actually reached the sheet.
 *
 * Expected, secret ABSENT — today's production bug, failing closed:
 *   step 1  200 NO TOKEN     step 2/3  409     sheet: [create]
 *
 * Expected, secret SET — the fix:
 *   step 1  200 token issued step 2/3  200     sheet: [create, update, update]
 */
import http from 'node:http';

/**
 * Upstash-compatible enough for the CLAIM, not just the counter.
 *
 * The first version implemented `SET NX` and nothing else, so `commitEmail`'s
 * plain SET silently failed and `GET` always returned null — which made every
 * repeat look INFLIGHT when production would call it a DUPLICATE. The harness
 * could not express the state it was being used to check, which is the same
 * fault that let S23 survive 200 passing tests.
 */
const store = new Map(); // key -> { v, expiresAt }
const alive = (e) => e && (e.expiresAt === null || e.expiresAt > Date.now());
const redis = http.createServer((q, r) => {
  let b = '';
  q.on('data', (c) => (b += c));
  q.on('end', () => {
    const out = JSON.parse(b || '[]').map((c) => {
      const [op, key, ...rest] = c.map(String);
      const e = store.get(key);
      if (op === 'SET') {
        const exAt = rest.indexOf('EX');
        const ttl = exAt >= 0 ? Number(rest[exAt + 1]) : null;
        if (rest.includes('NX') && alive(e)) return { result: null };
        store.set(key, { v: rest[0], expiresAt: ttl ? Date.now() + ttl * 1000 : null });
        return { result: 'OK' };
      }
      if (op === 'GET') return { result: alive(e) ? e.v : null };
      if (op === 'TTL') return { result: alive(e) ? Math.round((e.expiresAt - Date.now()) / 1000) : -2 };
      if (op === 'INCR') {
        const n = (alive(e) ? Number(e.v) : 0) + 1;
        store.set(key, { v: String(n), expiresAt: e?.expiresAt ?? null });
        return { result: n };
      }
      return { result: null };
    });
    r.setHeader('Content-Type', 'application/json');
    r.end(JSON.stringify(out));
  });
});
await new Promise((r) => redis.listen(0, '127.0.0.1', r));

const forwarded = [];
const stub = http.createServer((q, r) => {
  let b = ''; q.on('data', (c) => (b += c));
  q.on('end', () => { const p = JSON.parse(b); forwarded.push({ action: p.action, flavor: p.flavor ?? null });
    r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ ok: true, count: 140 })); });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));

process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${redis.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'stub';
process.env.SHEETS_WEBHOOK_URL = `http://127.0.0.1:${stub.address().port}/exec`;
process.env.SHEETS_WEBHOOK_TOKEN = 't';
process.env.EMAIL_HASH_PEPPER = 'x'.repeat(64);
if (process.argv[2] === 'with-secret') process.env.EDIT_TOKEN_SECRET = 'b'.repeat(64);
else { delete process.env.EDIT_TOKEN_SECRET; delete process.env.CONFIRM_TOKEN_SECRET; }

const { default: handler } = await import('/Users/emilnordin/Desktop/zuca-sec/api/waitlist.js');
const api = http.createServer((q, r) => { q.headers['x-real-ip'] = '51.175.3.3'; q.headers['x-vercel-ip-country'] = 'NO'; handler(q, r); });
await new Promise((r) => api.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${api.address().port}/api/waitlist`;
const send = (b) => fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json() }));

const base = { email: 'sim@example.com', consent_marketing: true, consent_text_version: 'mkt-eea-1', form_render_ts: Date.now() - 9000 };
const s1 = await send(base);
const s2 = await send({ ...base, flavor: 'both', ...(s1.j.edit_token ? { edit_token: s1.j.edit_token } : {}) });
const s3 = await send({ ...base, flavor: 'both', intent: 'preorder_now', ...(s1.j.edit_token ? { edit_token: s1.j.edit_token } : {}) });

// An EXPIRED token, which is the S23 shape in a two-hour window: the visitor
// finishes every screen and is told their spot is saved. The client keeps
// mapping `duplicate` to success, so the server has to hand it a different code
// or the loss stays silent.
let expired = { s: 'n/a', j: {} };
if (process.argv[2] === 'with-secret') {
  const { mintEditToken, EDIT_TTL_MS } = await import('/Users/emilnordin/Desktop/zuca-sec/src/lib/edit-token.js');
  const { emailHandle } = await import('/Users/emilnordin/Desktop/zuca-sec/src/lib/validation.js');
  const stale = await mintEditToken(await emailHandle(base.email), Date.now() - EDIT_TTL_MS - 60_000);
  expired = await send({ ...base, flavor: 'both', edit_token: stale });
}

console.log(`\n  ── ${process.argv[2] === 'with-secret' ? 'EDIT_TOKEN_SECRET SET (production as of now)' : 'EDIT_TOKEN_SECRET MISSING'} ──`);
console.log('  step 1 :', s1.s, s1.j.edit_token ? 'token issued' : 'NO TOKEN');
console.log('  step 2 :', s2.s, JSON.stringify(s2.j));
console.log('  step 3 :', s3.s, JSON.stringify(s3.j));
console.log('  expired:', expired.s, JSON.stringify(expired.j));
console.log('  reached the sheet:', JSON.stringify(forwarded));
api.close(); stub.close(); redis.close();
