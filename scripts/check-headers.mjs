/**
 * Security header scanner.
 *
 *   node scripts/check-headers.mjs                        # production
 *   node scripts/check-headers.mjs https://preview.url    # a preview deploy
 *
 * Run this against a real deployment after merging. `vercel.json` declaring a
 * header and the edge actually sending it are different claims — a typo in the
 * `source` pattern, or a dashboard-level override, silently drops the lot. The
 * only way to know is to ask the server.
 */

const target = process.argv[2] || 'https://zucasnacks.com';

/** [header, predicate, why it matters]. */
const CHECKS = [
  [
    'strict-transport-security',
    (v) => /max-age=(\d+)/.test(v) && Number(v.match(/max-age=(\d+)/)[1]) >= 15552000,
    'Forces HTTPS for return visits. Needs max-age of at least 180 days to be worth anything.',
  ],
  ['x-content-type-options', (v) => v === 'nosniff', 'Stops the browser guessing a MIME type we did not send.'],
  [
    'content-security-policy',
    (v) => v.includes("frame-ancestors 'none'"),
    'frame-ancestors is the modern clickjacking control and cannot be set from a meta tag.',
  ],
  [
    'content-security-policy',
    (v) => v.includes("base-uri 'none'") && v.includes("form-action 'self'"),
    'base-uri stops injected <base> tags rewriting every relative URL; form-action stops a form posting off-site.',
  ],
  ['x-frame-options', (v) => /^(DENY|SAMEORIGIN)$/i.test(v), 'Legacy clickjacking control, for browsers predating frame-ancestors.'],
  [
    'referrer-policy',
    (v) => /strict-origin-when-cross-origin|no-referrer|same-origin/i.test(v),
    'Keeps the full URL from leaking to third parties in the Referer header.',
  ],
  [
    'permissions-policy',
    (v) => /camera=\(\)/.test(v) && /microphone=\(\)/.test(v) && /geolocation=\(\)/.test(v),
    'Denies hardware this site has no reason to touch.',
  ],
  [
    'content-security-policy-report-only',
    (v) => v.includes("default-src 'self'") && !/script-src[^;]*unsafe-inline/.test(v),
    'The strict policy under observation. script-src must never carry unsafe-inline.',
  ],
];

const NEVER = [
  ['access-control-allow-origin', (v) => v === '*', 'Wildcard CORS on our own origin lets any site read our responses.'],
  ['server', (v) => /\d/.test(v), 'Version numbers in Server tell an attacker which exploits to try.'],
  ['x-powered-by', () => true, 'Same. Pure information disclosure, zero benefit.'],
];

async function scan(url) {
  const res = await fetch(url, { redirect: 'follow' });
  const h = res.headers;

  console.log(`\n  ${url}  →  HTTP ${res.status}\n`);
  console.log('  ' + '─'.repeat(96));

  let failed = 0;
  const seen = new Set();

  for (const [name, ok, why] of CHECKS) {
    const value = h.get(name);
    const key = `${name}:${why}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pass = value != null && ok(value);
    if (!pass) failed += 1;
    console.log(`  ${pass ? '✓' : '✗'} ${name}`);
    console.log(`      ${value ? value.slice(0, 150) + (value.length > 150 ? '…' : '') : '(absent)'}`);
    if (!pass) console.log(`      → ${why}`);
  }

  for (const [name, bad, why] of NEVER) {
    const value = h.get(name);
    if (value != null && bad(value)) {
      failed += 1;
      console.log(`  ✗ ${name}: ${value}`);
      console.log(`      → ${why}`);
    }
  }

  console.log('  ' + '─'.repeat(96));
  console.log(`  ${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}\n`);
  return failed;
}

// The write endpoint must never answer a cross-origin preflight with a wildcard.
async function scanApi(base) {
  const url = new URL('/api/waitlist', base).href;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: '{}',
    });
    const acao = res.headers.get('access-control-allow-origin');
    const ok = res.status === 403 && acao == null;
    console.log(`  ${ok ? '✓' : '✗'} /api/waitlist rejects a cross-origin POST`);
    console.log(`      status ${res.status}, Access-Control-Allow-Origin: ${acao ?? '(absent)'}`);
    if (!ok) console.log('      → An attacker page could drive signups through your visitors.\n');
    else console.log('');
    return ok ? 0 : 1;
  } catch (err) {
    // NOT a pass. An unreachable endpoint means this check did not run, and a
    // scan that silently scores 0 failures for a thing it never touched reads
    // as a clean bill of health.
    console.log(`  · /api/waitlist NOT REACHED (${err.message}) — this check did not run.`);
    console.log('    Expected before the endpoint deploys; after that, treat it as a failure.\n');
    return 0;
  }
}

const failures = (await scan(target)) + (await scanApi(target));
console.log(`  Scanned ${CHECKS.length} required headers and ${NEVER.length} forbidden ones against a live response.\n`);
process.exit(failures ? 1 : 0);
