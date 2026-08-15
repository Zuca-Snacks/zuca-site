/**
 * POST /api/waitlist — the only write path to the signup list.
 *
 * Why this file exists: before it, the browser called a Google Apps Script
 * webhook directly. That URL had to ship in the client bundle, which made it
 * public, which made the write endpoint public, unauthenticated and unmetered
 * (SECURITY.md, findings S1 and S3). Moving the call server-side is what lets
 * every control below exist at all — you cannot rate limit an endpoint you do
 * not own.
 *
 * Order of checks matters. Each one is cheaper than the next, so an attacker
 * pays as little of our compute as possible before being turned away:
 *   method → content-type → origin → size → rate limit → parse → validate →
 *   bot heuristics → duplicate → forward
 *
 * Responses follow the frozen contract in AGENTS_BRIEF.md and never explain
 * themselves. A 400 does not say which field failed and a 429 does not say
 * which bucket tripped; both go to the logs instead, because the difference
 * between "invalid email" and "you are rate limited on the hour bucket" is
 * exactly the feedback an attacker needs to tune around us.
 */

import {
  MAX_BODY_BYTES,
  validateWaitlist,
  detectBot,
  sanitizeRecord,
  emailHandle,
} from '../src/lib/validation.js';
import { checkRateLimit, isDuplicate, clientIp } from '../src/lib/ratelimit.js';

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const SHEETS_WEBHOOK_TOKEN = process.env.SHEETS_WEBHOOK_TOKEN;

/**
 * Same-origin only. The write endpoint must never answer `*` — that is what
 * turns a rate-limited endpoint into one any page on the internet can drive
 * using your visitors' browsers and their IP addresses.
 */
const ALLOWED_ORIGINS = new Set(
  [
    'https://zucasnacks.com',
    'https://www.zucasnacks.com',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NODE_ENV !== 'production' ? 'http://localhost:3003' : null,
    process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : null,
  ].filter(Boolean)
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Belt and braces: a JSON API has no business being framed or sniffed.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

/**
 * Read the body with a hard ceiling, aborting mid-stream.
 *
 * Checking `content-length` alone is not enough — it is a claim by the client,
 * and a chunked request need not send one at all. Counting bytes as they
 * arrive is the only limit that actually holds.
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        // Pause rather than destroy. Destroying here kills the socket before
        // the 413 can be written, and the client sees a connection reset with
        // no explanation. The caller responds first, then tears down.
        req.pause();
        reject(Object.assign(new Error('body_too_large'), { code: 'TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Structured, PII-free. Never log an email address, a name, or a ZIP. */
function audit(event, fields = {}) {
  console.log(JSON.stringify({ evt: `waitlist.${event}`, ...fields }));
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const ip = clientIp(req);

  // 1. Method. POST only — no GET, no OPTIONS preflight to satisfy, because a
  //    same-origin JSON POST from our own page does not trigger one.
  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST' });
  }

  // 2. Content type. Requiring JSON is a CSRF control as much as a parsing one:
  //    an HTML form on another site can only send text/plain, urlencoded or
  //    multipart, so this alone blocks cross-origin form submission.
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return send(res, 415, { ok: false, error: 'unsupported_media_type' });
  }

  // 3. Origin. Present on every cross-origin fetch and on same-origin POSTs in
  //    current browsers. Absent for server-to-server callers, which we allow —
  //    they are already covered by rate limiting, and rejecting them would
  //    break legitimate curl testing without stopping any real attacker.
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    audit('reject.origin', { ip_bucket: ip.slice(0, 7) });
    return send(res, 403, { ok: false, error: 'forbidden' });
  }

  // 4. Declared size, before we read a byte.
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) {
    return send(res, 413, { ok: false, error: 'payload_too_large' });
  }

  // 5. Rate limit. Ahead of parsing, so a flood costs us four Redis INCRs
  //    rather than a JSON parse and a schema walk.
  const rl = await checkRateLimit(req);
  if (!rl.allowed) {
    audit('reject.rate_limited', { scope: rl.scope, durable: rl.durable });
    return send(
      res,
      429,
      { ok: false, error: 'rate_limited' },
      { 'Retry-After': String(rl.retryAfter) }
    );
  }

  // 6. Read and parse.
  let raw;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err.code === 'TOO_LARGE') {
      // Answer, then hang up. Without `Connection: close` the client may keep
      // streaming a body we have already decided not to read, and without the
      // destroy we would sit there absorbing it.
      send(res, 413, { ok: false, error: 'payload_too_large' }, { Connection: 'close' });
      req.destroy();
      return;
    }
    return send(res, 400, { ok: false, error: 'validation' });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return send(res, 400, { ok: false, error: 'validation' });
  }

  // An array or a bare string parses as valid JSON but is not an object, and
  // handing either to the schema produces a confusing error rather than a clean
  // rejection.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return send(res, 400, { ok: false, error: 'validation' });
  }

  // 7. Validate against the frozen contract.
  const result = validateWaitlist(parsed);
  if (!result.ok) {
    audit('reject.validation', { issues: result.issues.map((i) => `${i.path}:${i.rule}`) });
    return send(res, 400, { ok: false, error: 'validation' });
  }
  const data = result.data;

  // 8. Bot heuristics.
  //
  //    A tripped honeypot returns 200. This is deliberate and is the single
  //    most useful thing in the file: a bot that receives an error learns its
  //    payload was rejected and iterates until it is not. A bot that receives
  //    the same success response as everyone else has no gradient to climb, and
  //    keeps filling a field that puts it straight in the bin. A false positive
  //    here would also silently drop a real signup — but the honeypot is a
  //    hidden input, so a real user cannot fill it in the first place.
  const botReason = detectBot(data);
  if (botReason) {
    audit('reject.bot', { reason: botReason });
    return send(res, 200, { ok: true });
  }

  const handle = await emailHandle(data.email);

  // 9. Duplicates. 409 per the contract; the UI is told to treat it as success,
  //    so this is not an enumeration oracle in practice — but note the honest
  //    limitation recorded in SECURITY.md: a 200/409 distinction is observable
  //    to someone calling the API directly. It is retained because the contract
  //    is frozen, and it is defensible: rate limiting caps an enumeration attack
  //    at 20 addresses per hour per IP, which is not a viable way to test a list.
  if (await isDuplicate(handle)) {
    audit('duplicate', { handle });
    return send(res, 409, { ok: false, error: 'duplicate' });
  }

  // 10. Build the record. Bot signals and the honeypot are dropped here — they
  //     are inputs to a decision already made, and storing them would put
  //     needless junk next to real data.
  //
  //     `motivation` is health-adjacent. It is retained only when the separate
  //     health opt-in is present; otherwise it is dropped on the floor, even
  //     though the user selected values. That is the point of a separate
  //     consent — selecting an option is not consenting to its storage.
  const record = sanitizeRecord({
    email: data.email,
    zip: data.zip,
    motivation: data.consent_health ? data.motivation : null,
    consent_health: data.consent_health,
    intent: data.intent,
    price_band: data.price_band,
    flavor: data.flavor,
    is_clinician: data.is_clinician,
    referral_source: data.referral_source,
    consent_marketing: data.consent_marketing,
    utm: data.utm,
    page_path: data.page_path,
    // Consent evidence. If the opt-in is ever challenged, these three fields
    // plus the timestamp are what answers it.
    consent_ts: new Date().toISOString(),
    consent_ip_prefix: ip.includes(':') ? ip.split(':').slice(0, 3).join(':') : ip.split('.').slice(0, 3).join('.') + '.0',
    user_agent: String(req.headers['user-agent'] || '').slice(0, 200),
  });

  if (data.motivation && !data.consent_health) {
    audit('motivation.dropped_no_consent', { handle });
  }

  // 11. Forward to the sheet, server-to-server, with a shared secret.
  //
  //     If the webhook is not configured we still return 200. The endpoint is
  //     being deployed ahead of the Apps Script rotation (SECURITY.md §8 item
  //     3), and failing signups during that window would cost real leads. The
  //     log line is the alarm.
  if (!SHEETS_WEBHOOK_URL) {
    audit('forward.skipped_unconfigured', { handle });
    return send(res, 200, { ok: true });
  }

  try {
    const upstream = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SHEETS_WEBHOOK_TOKEN ? { 'X-Zuca-Token': SHEETS_WEBHOOK_TOKEN } : {}),
      },
      body: JSON.stringify({ ...record, token: SHEETS_WEBHOOK_TOKEN }),
      signal: AbortSignal.timeout(8000),
      // Unlike the browser call this replaces, we can actually read the
      // response — which is the whole reason the silent-failure bug (S7) goes
      // away. Apps Script answers with a 302 to googleusercontent; follow it.
      redirect: 'follow',
    });

    if (!upstream.ok) {
      audit('forward.failed', { handle, status: upstream.status });
      return send(res, 500, { ok: false, error: 'server' });
    }
  } catch (err) {
    audit('forward.error', { handle, reason: err.name });
    return send(res, 500, { ok: false, error: 'server' });
  }

  audit('accepted', { handle, has_health_consent: data.consent_health });
  return send(res, 200, { ok: true });
}

/**
 * Disable Vercel's automatic body parsing. We read the stream ourselves so the
 * size limit is enforced during transfer rather than after a full buffer.
 */
export const config = {
  api: { bodyParser: false },
};
