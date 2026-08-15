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
 * Floor shown if the upstream is unreachable. The counter is social proof, and
 * a hero section that renders "0 pre-orders" during a transient blip is worse
 * than one that renders a slightly stale number.
 */
const FALLBACK_COUNT = 136;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', CACHE);

  if (!SHEETS_WEBHOOK_URL) {
    return res.end(JSON.stringify({ count: FALLBACK_COUNT }));
  }

  try {
    const upstream = await fetch(SHEETS_WEBHOOK_URL, {
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
    const data = await upstream.json();
    const count = Number.isFinite(data?.count) ? Math.max(0, Math.trunc(data.count)) : FALLBACK_COUNT;
    return res.end(JSON.stringify({ count }));
  } catch (err) {
    console.log(JSON.stringify({ evt: 'count.upstream_error', reason: err.name }));
    // Serve the fallback but do not let it be cached for long.
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10');
    return res.end(JSON.stringify({ count: FALLBACK_COUNT }));
  }
}
