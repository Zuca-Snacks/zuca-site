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
export async function isDuplicate(emailHash, { namespace = 'waitlist', ttlSec = 400 * 86400 } = {}) {
  if (!DURABLE) return false;

  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // SET NX returns null when the key already exists — one atomic
      // test-and-set, so two concurrent submissions of the same address cannot
      // both be treated as new.
      body: JSON.stringify([['SET', `seen:${namespace}:${emailHash}`, '1', 'NX', 'EX', String(ttlSec)]]),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const results = await res.json();
    return results[0]?.result === null;
  } catch (err) {
    console.error('[ratelimit] duplicate check unavailable:', err.message);
    return false;
  }
}
