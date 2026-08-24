/**
 * Rate limiting for POST /api/waitlist.
 *
 * The host is serverless. An in-memory counter is close to useless there: each
 * lambda instance gets its own Map, Vercel runs as many instances as it likes,
 * and instances are recycled between requests. A burst spread across 20 cold
 * starts sees a fresh counter 20 times.
 *
 * So the durable path is Upstash Redis over its REST API (no TCP socket, no
 * connection pooling, works inside a lambda). If the Upstash env vars are
 * absent we fall back to an in-memory limiter and say so loudly on boot —
 * because a rate limiter that silently does nothing is worse than none at all.
 *
 * Provisioning is an owner action; see .env.example and SECURITY.md §8.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const DURABLE = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

if (!DURABLE && process.env.NODE_ENV === 'production') {
  console.warn(
    '[ratelimit] UPSTASH_REDIS_REST_URL / _TOKEN are not set. Falling back to a ' +
      'per-instance in-memory limiter, which does NOT hold across serverless ' +
      'instances. The waitlist endpoint is effectively unmetered. See SECURITY.md §8.'
  );
}

/**
 * Limits.
 *
 * Tuned so that no real person can reach them. A household or office behind one
 * NAT address might legitimately produce a handful of signups in an hour; 20 is
 * comfortably above that and far below what makes list poisoning worthwhile.
 * The global ceiling is the backstop for a distributed botnet, where per-IP
 * limits do nothing — it is set above any plausible organic spike from the
 * campaign, and tripping it should page someone rather than be ignored.
 */
export const LIMITS = {
  perIpPerMinute: { limit: 5, windowSec: 60 },
  perIpPerHour: { limit: 20, windowSec: 3600 },
  globalPerMinute: { limit: 120, windowSec: 60 },
  globalPerHour: { limit: 1500, windowSec: 3600 },
};

// ─── Durable backend ─────────────────────────────────────────────────────────

/**
 * One Upstash round trip per check, pipelined: INCR then EXPIRE-if-new.
 *
 * INCR is atomic, which is the whole point — a read-then-write would race
 * between concurrent lambdas and let a burst through. EXPIRE is applied only
 * when INCR returns 1 (i.e. we created the key), so the window is fixed from
 * first hit rather than sliding forward on every request.
 */
async function upstashIncr(key, windowSec) {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(windowSec), 'NX'],
      ['TTL', key],
    ]),
    signal: AbortSignal.timeout(2000),
  });

  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const results = await res.json();
  const count = Number(results[0]?.result ?? 0);
  const ttl = Number(results[2]?.result ?? windowSec);
  return { count, ttl: ttl > 0 ? ttl : windowSec };
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

const memory = new Map();

function memoryIncr(key, windowSec) {
  const now = Date.now();
  const entry = memory.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowSec * 1000;
    memory.set(key, { count: 1, resetAt });
    // Opportunistic sweep. The Map is per-instance and short-lived, but a
    // long-running instance under attack would otherwise grow it without bound.
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return { count: 1, ttl: windowSec };
  }

  entry.count += 1;
  return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) };
}

/**
 * Test-only: clear in-memory bucket state so one test group's traffic does not
 * exhaust the global ceiling for the next.
 *
 * Hard no-op in production. A function that resets a live rate limiter is
 * exactly the sort of convenience that turns into a bypass, so it refuses to
 * do anything where it would matter.
 */
export function __resetInMemoryLimiter() {
  if (process.env.NODE_ENV === 'production') return false;
  memory.clear();
  return true;
}

async function incr(key, windowSec) {
  if (!DURABLE) return memoryIncr(key, windowSec);
  try {
    return await upstashIncr(key, windowSec);
  } catch (err) {
    // Fail closed-ish: if the durable store is unreachable we still count in
    // memory rather than waving everything through. An Upstash outage should
    // degrade the limiter, not disable it.
    console.error('[ratelimit] durable store unavailable, degrading to memory:', err.message);
    return memoryIncr(key, windowSec);
  }
}

// ─── Client identity ─────────────────────────────────────────────────────────

/**
 * Determine the client IP.
 *
 * `x-forwarded-for` is attacker-controlled in general, so we only trust it
 * because Vercel's edge overwrites it — the LAST entry it appends is the real
 * peer. Taking the first entry, which is the common mistake, would let anyone
 * bypass the limiter entirely by sending `X-Forwarded-For: 1.2.3.4`.
 * `x-real-ip` is set by the platform and is preferred where present.
 */
export function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();

  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    const parts = fwd.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  return req.socket?.remoteAddress || 'unknown';
}

/** Bucket IPv6 clients by /64 — a single subscriber is routinely handed a whole /64. */
function ipKey(ip) {
  if (ip.includes(':')) {
    const groups = ip.split(':').slice(0, 4);
    return `v6:${groups.join(':')}`;
  }
  return `v4:${ip}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check every bucket for this request.
 *
 * Returns `{ allowed, retryAfter, scope }`. Buckets are checked cheapest-first
 * and every one is incremented even when an earlier one already denied — a
 * request that is refused still consumed our capacity, and not counting it
 * would let an attacker sit just under one limit while hammering another.
 */
export async function checkRateLimit(req, { namespace = 'waitlist' } = {}) {
  const key = ipKey(clientIp(req));
  const minuteWindow = Math.floor(Date.now() / (LIMITS.perIpPerMinute.windowSec * 1000));
  const hourWindow = Math.floor(Date.now() / (LIMITS.perIpPerHour.windowSec * 1000));

  const buckets = [
    { scope: 'ip_minute', key: `rl:${namespace}:${key}:m:${minuteWindow}`, ...LIMITS.perIpPerMinute },
    { scope: 'ip_hour', key: `rl:${namespace}:${key}:h:${hourWindow}`, ...LIMITS.perIpPerHour },
    { scope: 'global_minute', key: `rl:${namespace}:global:m:${minuteWindow}`, ...LIMITS.globalPerMinute },
    { scope: 'global_hour', key: `rl:${namespace}:global:h:${hourWindow}`, ...LIMITS.globalPerHour },
  ];

  const results = await Promise.all(buckets.map((b) => incr(b.key, b.windowSec)));

  for (let i = 0; i < buckets.length; i++) {
    if (results[i].count > buckets[i].limit) {
      return {
        allowed: false,
        retryAfter: Math.max(1, results[i].ttl),
        scope: buckets[i].scope,
        durable: DURABLE,
      };
    }
  }

  return {
    allowed: true,
    remaining: LIMITS.perIpPerMinute.limit - results[0].count,
    durable: DURABLE,
  };
}

/**
 * Duplicate suppression, keyed by a hash of the email.
 *
 * Returns true if this address has been seen before. The raw address is never
 * used as a key: Redis keys turn up in dashboards, slow-query logs and backups,
 * and an unhashed key would make the rate-limit store a second copy of the
 * mailing list. The handle passed in is a *keyed* HMAC (see `emailHandle` in
 * validation.js) rather than a plain digest, because a plain hash of an email
 * is reversible by enumeration and would still be personal data under GDPR.
 *
 * With the durable store absent this returns false — better to accept a
 * duplicate row than to reject a genuine signup.
 */
/**
 * ─── A CLAIM WITH TWO LIFETIMES ──────────────────────────────────────────────
 *
 * This replaces `isDuplicate`, which burned the key for 400 days the moment a
 * submission ARRIVED — before the row existed.
 *
 * The failure that forced this, measured in production: the Apps Script forward
 * aborts at 8s, Apps Script is sometimes slower than that and completes the
 * append anyway, and the handler returns 500. The visitor is told it failed,
 * the row may or may not exist, and the key is spent either way. Their retry
 * gets a 409 forever. Where the forward genuinely failed there is no row and no
 * path to ever create one. Merge measured /api/count 274 -> 278: four rows from
 * five POSTs, of which two returned 200.
 *
 * So the key now has two states rather than one lifetime:
 *
 *   INFLIGHT   ~90s, written on arrival. Long enough to block a double-submit,
 *              far clear of the 8s abort, and it LAPSES ON ITS OWN — so a
 *              request that never produced a row cannot lock the address out.
 *   COMMITTED  400 days, written only after the forward actually succeeded.
 *              This is the real duplicate.
 *
 * On failure or timeout the key is deliberately LEFT ALONE. Deleting it would
 * be worse: after a timeout we cannot know whether the append landed, and
 * deleting invites a retry that races an in-flight write.
 *
 * THE TRADE, ON THE RECORD: a retry after a timeout that actually landed can
 * produce a duplicate row. A duplicate row is visible in the sheet and can be
 * deleted. A locked-out signup is invisible and cannot be recovered by anyone —
 * the person simply never appears. Same principle that keeps `event_id` out of
 * CORE_KEYS: never let the bookkeeping cost the thing being booked.
 */

/** Written on arrival. Must outlast the 8s forward abort by a wide margin. */
export const INFLIGHT_TTL_SEC = 90;
/** Written only once a row exists. */
export const COMMITTED_TTL_SEC = 400 * 86400;

const CLAIM_KEY = (ns, h) => `seen:${ns}:${h}`;

async function pipeline(commands, timeoutMs = 2000) {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Claim an address for this request.
 *
 *   { claimed: true }                      first arrival — proceed
 *   { claimed: false, state: 'committed' } a row already exists — 409
 *   { claimed: false, state: 'inflight' }  another request is mid-forward
 *   { claimed: true, durable: false }      no Upstash: no duplicate detection,
 *                                          same as the old behaviour
 *
 * SET NX and GET in one pipeline: NX is the atomic test-and-set that stops two
 * concurrent submissions both being treated as new, and the GET tells us which
 * state we lost to. Reading the value in a second round trip would race.
 */
export async function claimEmail(emailHash, { namespace = 'waitlist' } = {}) {
  if (!DURABLE) return { claimed: true, durable: false };
  const key = CLAIM_KEY(namespace, emailHash);
  try {
    const out = await pipeline([
      ['SET', key, 'inflight', 'NX', 'EX', String(INFLIGHT_TTL_SEC)],
      ['GET', key],
    ]);
    if (!out) return { claimed: true, durable: false };
    if (out[0]?.result === 'OK') return { claimed: true, durable: true };
    const state = out[1]?.result === 'committed' ? 'committed' : 'inflight';
    return { claimed: false, state, durable: true };
  } catch (err) {
    // Availability of the duplicate store must not decide whether someone can
    // join a waitlist. Fail open, exactly as the old check did.
    console.error('[ratelimit] claim unavailable:', err.message);
    return { claimed: true, durable: false };
  }
}

/**
 * Promote a claim to committed. Call ONLY after the forward has succeeded.
 *
 * Plain SET, no NX: it overwrites this request's own `inflight` marker, which
 * is the point. Returns false if the store was unreachable — the claim then
 * lapses in 90s and the address can be submitted again, which is the safe
 * direction.
 */
export async function commitEmail(emailHash, { namespace = 'waitlist' } = {}) {
  if (!DURABLE) return false;
  try {
    const out = await pipeline([
      ['SET', CLAIM_KEY(namespace, emailHash), 'committed', 'EX', String(COMMITTED_TTL_SEC)],
    ]);
    return out?.[0]?.result === 'OK';
  } catch (err) {
    console.error('[ratelimit] commit failed:', err.message);
    return false;
  }
}

/**
 * Read a claim's value and REAL remaining TTL.
 *
 * For tests and for operators. Asserting on the TTL we intended to write proves
 * nothing about the TTL that is actually there — which is the whole reason this
 * bug survived: the intended lifetime and the effective one had diverged and
 * nothing read the second.
 */
export async function inspectClaim(emailHash, { namespace = 'waitlist' } = {}) {
  if (!DURABLE) return { durable: false };
  try {
    const key = CLAIM_KEY(namespace, emailHash);
    const out = await pipeline([['GET', key], ['TTL', key]]);
    if (!out) return { durable: false };
    return { durable: true, value: out[0]?.result ?? null, ttl: out[1]?.result ?? null };
  } catch {
    return { durable: false };
  }
}

