/**
 * GET /api/count — the public signup counter rendered on the page.
 *
 * Exists so the browser stops talking to the Apps Script directly. Once the
 * webhook URL is server-only (SECURITY.md S3) the client has no way to fetch
 * the count itself, and this is the replacement.
 *
 * It returns a count and nothing else — never a list, never a record. The
 * upstream `doGet` returns the same shape, but we re-read and re-emit only the
 * `count` field rather than proxying the body through, so a future change to
 * the Apps Script cannot start leaking rows via this route by accident.
 */

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;

/**
 * Cached at the edge for 60s. This is the counter's real defence: the number
 * is public and boring, but an uncached proxy would let anyone burn our
 * function invocations and the Apps Script's daily URL-fetch quota by holding
 * down refresh. `stale-while-revalidate` keeps the page fast during a refresh.
 */
const CACHE = 'public, max-age=30, s-maxage=60, stale-while-revalidate=600';

/**
 * There is no fallback count, deliberately.
 *
 * This used to serve a hardcoded 136 whenever the sheet was unreachable — a
 * fabricated number presented as a measurement, and by now wrong regardless.
 * The reasoning was that a stale number beats "0 signups" in a hero section.
 * That was right about 0 and wrong about the remedy: the fix for a bad number
 * is no number, not a better-looking bad number.
 *
 * `count: null` means "we do not know". It cannot be formatted, summed or
 * compared by accident, and it forces the client to decide — which for a
 * social-proof counter means rendering nothing at all. A counter that might be
 * fiction is worth less than the space it occupies.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // `?fresh=1` bypasses every cache in the path.
  //
  // The counter is edge-cached for 60s, which is right for the 99% of reads
  // that just render a number on a page — but wrong for the one read that
  // matters most, immediately after a signup, where a stale value shows the
  // person their own submission did not count. The query string is part of the
  // cache key, so this is a genuinely separate entry rather than a hint the CDN
  // may ignore.
  //
  // Prefer the `count` now returned in the POST /api/waitlist response: it
  // needs no second request at all. This exists for clients that cannot use it.
  const fresh = /[?&]fresh=1(&|$)/.test(req.url || '');
  res.setHeader('Cache-Control', fresh ? 'no-store, max-age=0' : CACHE);
  if (fresh) res.setHeader('CDN-Cache-Control', 'no-store');

  if (!SHEETS_WEBHOOK_URL) {
    console.log(JSON.stringify({ evt: 'count.unconfigured' }));
    return res.end(JSON.stringify({ count: null, error: 'unconfigured' }));
  }

  try {
    const upstream = await fetch(SHEETS_WEBHOOK_URL, {
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
    const data = await upstream.json();

    // The sheet now answers {count: null, error} when it cannot trust its own
    // reading — a wrong tab, a missing header row. Passing that through matters
    // more than passing a number through: upstream has already decided it does
    // not know, and inventing one here would discard the only honest signal in
    // the chain.
    if (!Number.isFinite(data?.count)) {
      console.log(JSON.stringify({ evt: 'count.untrusted', upstream: data?.error ?? 'malformed' }));
      res.setHeader('Cache-Control', 'no-store');
      return res.end(JSON.stringify({ count: null, error: data?.error ?? 'unavailable' }));
    }
    return res.end(JSON.stringify({ count: Math.max(0, Math.trunc(data.count)) }));
  } catch (err) {
    console.log(JSON.stringify({ evt: 'count.upstream_error', reason: err.name }));
    // Never cache a non-answer — the next request should try again.
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ count: null, error: 'unavailable' }));
  }
}
