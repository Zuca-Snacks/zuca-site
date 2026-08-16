/**
 * POST /api/csp-report — collector for Content-Security-Policy violations.
 *
 * The CSP ships in Report-Only mode first (SECURITY.md S9). That is only
 * useful if the reports go somewhere, and this is the somewhere. Read the
 * output with `vercel logs --follow` for a week, confirm the only violations
 * are ones you expect, then flip the header to enforcing.
 *
 * Reports arrive unauthenticated by design — the browser sends them and cannot
 * be made to authenticate. So this endpoint treats every field as hostile: it
 * logs a fixed set of keys, truncated, and never echoes anything back.
 */

const MAX_BODY_BYTES = 16 * 1024;

/** Crude per-instance throttle. A misbehaving extension can generate thousands
 *  of reports per page load, and the log is not worth paying for. */
let windowStart = 0;
let windowCount = 0;
const MAX_REPORTS_PER_MINUTE = 60;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('too_large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Always 204, whatever happens. Browsers ignore the response and an error
  // status would only produce console noise on a page that is already fine.
  const done = () => {
    res.statusCode = 204;
    res.end();
  };

  if (req.method !== 'POST') return done();

  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (++windowCount > MAX_REPORTS_PER_MINUTE) return done();

  try {
    const raw = await readBody(req, MAX_BODY_BYTES);
    const parsed = JSON.parse(raw);

    // Two wire formats in the wild: the legacy `report-uri` shape
    // (`{"csp-report": {...}}`) and the Reporting API array shape.
    const reports = Array.isArray(parsed)
      ? parsed.map((r) => r.body ?? r)
      : [parsed['csp-report'] ?? parsed];

    for (const r of reports.slice(0, 5)) {
      if (!r || typeof r !== 'object') continue;
      console.log(
        JSON.stringify({
          evt: 'csp.violation',
          directive: String(r['effective-directive'] ?? r.effectiveDirective ?? '').slice(0, 64),
          blocked: String(r['blocked-uri'] ?? r.blockedURL ?? '').slice(0, 200),
          document: String(r['document-uri'] ?? r.documentURL ?? '').slice(0, 200),
          disposition: String(r.disposition ?? '').slice(0, 16),
        })
      );
    }
  } catch {
    // Malformed report. Nothing to do and nothing worth logging.
  }

  return done();
}

export const config = {
  api: { bodyParser: false },
};
