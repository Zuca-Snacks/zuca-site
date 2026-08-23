/**
 * Meta Conversions API — server-side Lead events.
 *
 * ─── SERVER ONLY. NOTHING HERE MAY EVER GAIN A `VITE_` PREFIX. ───────────────
 *
 * Vite inlines any `VITE_`-prefixed variable into the bundle served to every
 * visitor. `META_CAPI_TOKEN` is a long-lived credential that can write events
 * against the pixel and read from it; in a public repository's built output it
 * would be a published constant. Same rule, same reason, as SECURITY.md S3.
 *
 * ─── What leaves this process ────────────────────────────────────────────────
 *
 * The raw email address never does. It is SHA-256'd here — trim, lowercase,
 * hex — and only the digest is sent. Meta's matching expects exactly that
 * normalisation, so hashing correctly is both the privacy requirement and the
 * functional one; a digest of an untrimmed address matches nothing and leaks
 * nothing, which is a failure that looks like success.
 *
 * ─── Why the access token is in the body ─────────────────────────────────────
 *
 * Query strings end up in access logs, proxy logs, and error reports at every
 * hop. A token in `?access_token=` is a token written to disk in several places
 * nobody audits. In the JSON body it travels under TLS and stays in memory.
 *
 * ─── Why this never throws ───────────────────────────────────────────────────
 *
 * Analytics must not be able to fail a signup. Every path returns a result
 * object; the caller discards it. A person joining a waitlist has no interest
 * in whether Meta accepted our event.
 */
import { createHash } from 'node:crypto';

/** Meta rejects an event older than 7 days; 1.5s keeps us far inside a serverless budget. */
const TIMEOUT_MS = 1500;
const GRAPH_VERSION = 'v19.0';

/**
 * Read at CALL time, never at module load.
 *
 * `api/waitlist.js` imports this at the top, so a module-scope read happens at
 * process boot — before anything can set a variable, and frozen for the life of
 * the instance. That exact mistake already cost this project once: the edit
 * token minted as `null` because its secret was read at import, and the
 * endpoint fell back to a 409 silently. Making it a function makes the question
 * "is it configured now" rather than "was it configured when someone first
 * imported me".
 */
const cfg = () => ({
  pixelId: process.env.META_PIXEL_ID,
  token: process.env.META_CAPI_TOKEN,
  testCode: process.env.META_TEST_EVENT_CODE,
});

/**
 * Meta's normalisation for an email before hashing: trim, lowercase, SHA-256,
 * lowercase hex. Exported so a test can assert on it directly rather than
 * inferring it from a request body.
 */
export function hashEmail(email) {
  return createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

/**
 * First entry of `x-forwarded-for`.
 *
 * On Vercel this header is overwritten at the edge, so the first entry is the
 * real client and cannot be spoofed by a caller adding their own. Taking the
 * first is only correct BECAUSE of that; behind a proxy that appends rather
 * than replaces, the first entry would be attacker-controlled.
 */
function clientIpFrom(headers) {
  const xff = headers?.['x-forwarded-for'];
  if (typeof xff !== 'string' || !xff) return undefined;
  const first = xff.split(',')[0].trim();
  return first || undefined;
}

/**
 * Send one Lead event. Returns a result; never throws, never rejects.
 *
 *   { sent: true,  status }                     Meta accepted
 *   { sent: false, reason: 'unconfigured' }     no pixel id or no token
 *   { sent: false, reason: 'http', status }     Meta answered non-2xx
 *   { sent: false, reason: 'timeout' }          exceeded TIMEOUT_MS
 *   { sent: false, reason: 'network', error }   anything else
 *
 * The caller logs `unconfigured` and `http` on the request that produced them —
 * a boot-time warning would be printed once, scroll away, and leave every later
 * signup failing in silence.
 */
export async function sendLeadEvent({
  email,
  eventId,
  eventSourceUrl,
  headers = {},
  fbp,
  fbc,
  now = Date.now(),
} = {}) {
  const { pixelId, token, testCode } = cfg();
  if (!pixelId || !token) return { sent: false, reason: 'unconfigured' };

  const userData = {
    // Array-of-one is Meta's shape for hashed identifiers, not a quirk of ours.
    em: [hashEmail(email)],
  };
  const ip = clientIpFrom(headers);
  if (ip) userData.client_ip_address = ip;
  const ua = headers['user-agent'];
  if (typeof ua === 'string' && ua) userData.client_user_agent = ua;
  // OMITTED, not empty-stringed. Meta treats a present-but-empty identifier as
  // a value that matched nothing, which degrades the match quality score for
  // every event we send rather than simply being absent from this one.
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(now / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: eventSourceUrl,
        user_data: userData,
      },
    ],
    // In the BODY. See the header comment: a query string is a token on disk.
    access_token: token,
  };
  if (testCode) body.test_event_code = testCode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return { sent: false, reason: 'http', status: res.status };
    return { sent: true, status: res.status };
  } catch (err) {
    if (err?.name === 'AbortError') return { sent: false, reason: 'timeout' };
    return { sent: false, reason: 'network', error: String(err?.message || err) };
  } finally {
    // Always cleared. A pending timer keeps the event loop alive, which on a
    // serverless function is billed time and a delayed response.
    clearTimeout(timer);
  }
}
