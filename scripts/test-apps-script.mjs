/**
 * Apps Script migration test.
 *
 *   node scripts/test-apps-script.mjs
 *
 * Loads the REAL server/apps-script/Code.gs into a sandbox with the Apps Script
 * globals stubbed, points it at a mock sheet carrying the OLD header row, and
 * checks where each field actually lands.
 *
 * The bug this exists to catch: a key the script does not know about is written
 * nowhere and reports no error. That is invisible in code review and invisible
 * in production — the row appears, just with empty cells. The only way to know
 * is to run it and look at the cells.
 */

import fs from 'node:fs';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(new URL('../server/apps-script/Code.gs', import.meta.url), 'utf8');

// ─── Mock sheet ──────────────────────────────────────────────────────────────

function makeSheet(headerRow, dataRows = null) {
  // 137 filler rows so the tab looks like the live one. The guards refuse a
  // near-empty tab, which is the whole point of them.
  const filler = dataRows ?? Array.from({ length: 137 }, () => headerRow.map(() => ''));
  const grid = [headerRow.slice(), ...filler.map((r) => r.slice())];

  const widen = (row, n) => {
    while (row.length < n) row.push('');
  };

  return {
    _grid: grid,
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(...grid.map((r) => r.length)),
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues() {
          const out = [];
          for (let r = row; r < row + numRows; r++) {
            const src = grid[r - 1] || [];
            const line = [];
            for (let c = col; c < col + numCols; c++) line.push(src[c - 1] ?? '');
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          values.forEach((line, i) => {
            const r = row + i - 1;
            while (grid.length <= r) grid.push([]);
            widen(grid[r], col + line.length - 1);
            line.forEach((v, j) => {
              grid[r][col + j - 1] = v;
            });
          });
          return this;
        },
        getValue() {
          return grid[row - 1]?.[col - 1] ?? '';
        },
        setValue(v) {
          const r = row - 1;
          while (grid.length <= r) grid.push([]);
          widen(grid[r], col);
          grid[r][col - 1] = v;
          return this;
        },
        setNumberFormat() {
          return this;
        },
      };
    },
  };
}

// ─── Sandbox ─────────────────────────────────────────────────────────────────

function loadScript(sheet, token = 'test-token') {
  const responses = [];
  const logs = [];
  const sandbox = {
    console: { log: (m) => logs.push(String(m)), error: (m) => logs.push(String(m)) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => (k === 'ZUCA_TOKEN' ? token : null) }),
    },
    SpreadsheetApp: {
      // Named-tab lookup is honoured, so the wrong-tab guard is exercised
      // rather than bypassed. A mock that returns the sheet for any name would
      // make the guard untestable and always green.
      openById: () => ({
        getSheetByName: (n) => (n === 'Pre-orders' ? sheet : null),
        getSheets: () => [{ getName: () => 'Sheet1' }, { getName: () => 'Pre-orders' }],
      }),
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => (n === 'Pre-orders' ? sheet : null),
        getSheets: () => [{ getName: () => 'Pre-orders' }],
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (t) => {
        responses.push(JSON.parse(t));
        return { setMimeType: () => t };
      },
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
    },
    Date,
    JSON,
    String,
    Number,
    Math,
    Array,
    Object,
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, responses, logs };
}

function post(sheet, payload, token = 'test-token') {
  const { sandbox, responses, logs } = loadScript(sheet, token);
  sandbox.doPost({ postData: { contents: JSON.stringify({ ...payload, token }) } });
  return { response: responses[responses.length - 1], logs };
}

// ─── Runner ──────────────────────────────────────────────────────────────────

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures += 1;
  console.log(`  ${pass ? '✓' : '✗'} ${name}`);
  if (detail) console.log(`      ${detail}`);
}

// Defaults to the LAST row, not the first. The mock now pads 137 filler rows so
// the wrong-tab guard has something to pass on, which pushed the row under test
// to the bottom — reading row 1 silently measured an empty filler instead.
function cellFor(sheet, field, rowIndex = -1) {
  const headers = sheet._grid[0].map((h) => String(h).trim().toLowerCase().replace(/[\s_-]+/g, ''));
  const want = field.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const at = headers.indexOf(want);
  if (at === -1) return { missing: true };
  const row = rowIndex < 0 ? sheet._grid.length - 1 : rowIndex;
  return { column: at + 1, value: sheet._grid[row]?.[at] ?? '' };
}

console.log('\n══ Apps Script migration test ══\n');

// The old sheet, as it exists today: whatever the previous script wrote.
// The REAL header row, as it exists in the live sheet. Not what I assumed for
// three days — assumed: Timestamp, name, email, phone, hearAbout, reason.
const OLD_HEADERS = ['Timestamp', 'Email', 'Phone', 'How They Heard', 'Reason', 'Source', 'Name'];

console.log('  Scenario A — legacy modal posts to the hardened script');
console.log('  (the fallback path: old client, new backend)\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  const { response, logs } = post(sheet, {
    name: 'Kari Nordmann',
    email: 'Kari@Example.NO',
    phone: "'+4791234567",
    hearAbout: 'physician',
    reason: 'gut',
  });

  check('accepted', response?.ok === true, JSON.stringify(response));
  // 'How They Heard', not 'hearAbout' — COLUMN_ALIASES routes the legacy
  // payload key into the column the sheet already uses, rather than creating a
  // second column beside the populated one and splitting the data.
  for (const f of ['Name', 'Phone', 'How They Heard', 'Email']) {
    const c = cellFor(sheet, f);
    check(`legacy field "${f}" is stored`, !c.missing && c.value !== '', `col ${c.column} = ${JSON.stringify(c.value)}`);
  }
  const reason = cellFor(sheet, 'reason');
  check(
    'legacy "reason" is dropped (Art 9, no consent) — and logged, not silent',
    reason.value === '' && logs.some((l) => l.includes('legacy_reason_dropped')),
    `reason cell = ${JSON.stringify(reason.value)}; log: ${logs.find((l) => l.includes('legacy_reason')) ?? 'NONE'}`
  );
  check(
    'no duplicate column created for existing "Timestamp"',
    sheet._grid[0].filter((h) => String(h).toLowerCase() === 'timestamp').length === 1,
    `headers: ${sheet._grid[0].join(', ')}`
  );
}

console.log('\n  Scenario B — new contract posts to the hardened script');
console.log('  (the target path: new client via /api/waitlist)\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  const { response } = post(sheet, {
    email: 'ola@example.no',
    zip: '94305',
    referral_source: 'doctor',
    motivation: ['gut_health', 'digestion'],
    consent_health: true,
    consent_marketing: true,
    intent: 'preorder_now',
    price_band: '24_29',
    flavor: 'both',
    is_clinician: true,
    utm: { source: 'newsletter', campaign: 'launch' },
    page_path: '/',
    consent_text_version: '2026-08-15.marketing.a',
    motivation_consent_text_version: '2026-08-15.health.a',
    referral_source_other: 'Podcast',
    quantity_band: '4_8',
    office_interest: 'maybe',
    company: 'Acme AS',
    headcount: '10_49',
    phone: '+4791234567',
    consent_sms: true,
    sms_consent_text_version: '2026-08-17.sms.a',
    address_line1: 'Storgata 1',
    address_city: 'Oslo',
    address_postal_code: '0150',
    address_country: 'NO',
    consent_postal: true,
    postal_consent_text_version: '2026-08-17.postal.a',
    consent_timestamp: '2026-08-15T12:00:00.000Z',
    country: 'NO',
    needs_reconsent: false,
    consent_regime_status: 'ok',
    email_handle: 'ab12cd34ef56',
    confirmed: false,
    confirmed_at: null,
    reconsent_reason: null,
    consent_receipt: JSON.stringify({
      schema: 'zuca.consent.v2',
      marketing: {
        granted: true,
        version: '2026-08-15.marketing.a',
        text: 'Email me when pre-orders open. You can unsubscribe any time.',
        registry_match: true,
      },
      health: {
        granted: true,
        version: '2026-08-15.health.a',
        text: 'Store my reason for interest so you can tailor what you send me.',
        registry_match: true,
      },
      timestamp: '2026-08-15T12:00:00.000Z',
      country: 'NO',
      regime: 'eea',
      reconciliation: { needs_reconsent: false, status: 'ok', reason: null, country: 'NO', marketing_regime: 'global', health_regime: 'global' },
      ip_prefix: '203.0.113.0',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      method: 'web_form',
    }),
    consent_ip_prefix: '203.0.113.0',
    user_agent: 'Mozilla/5.0',
  });

  check('accepted', response?.ok === true, JSON.stringify(response));
  for (const [f, expect] of [
    ['referral_source', 'doctor'],
    ['motivation', 'gut_health|digestion'],
    ['consent_text_version', '2026-08-15.marketing.a'],
    ['motivation_consent_text_version', '2026-08-15.health.a'],
    ['country', 'NO'],
    ['consent_regime_status', 'ok'],
    ['utm_source', 'newsletter'],
    ['zip', "'94305"], // force-text: a US zip like 01234 must keep its leading zero
    ['flavor', 'both'],
    ['quantity_band', '4_8'],
    ['company', 'Acme AS'],
    ['headcount', '10_49'],
    ['referral_source_other', 'Podcast'],
    ['address_city', 'Oslo'],
    ['address_country', 'NO'],
  ]) {
    const c = cellFor(sheet, f);
    check(`new field "${f}" lands correctly`, !c.missing && String(c.value) === expect, `col ${c.column} = ${JSON.stringify(c.value)}`);
  }
  // The receipt is ~550 chars and the default cell cap is 500. Truncated JSON
  // is not shortened JSON, it is broken JSON — and it would break precisely
  // when someone needs to read it. Prove it survives whole.
  {
    const c = cellFor(sheet, 'consent_receipt');
    let parsed = null;
    try {
      parsed = JSON.parse(String(c.value));
    } catch {
      /* stays null */
    }
    check(
      'consent_receipt round-trips as valid JSON (not truncated)',
      parsed !== null,
      `${String(c.value).length} chars, parse ${parsed ? 'OK' : 'FAILED'}`
    );
    check(
      'consent_receipt carries the verbatim MARKETING wording',
      parsed?.marketing?.text === 'Email me when pre-orders open. You can unsubscribe any time.',
      `marketing.text = ${JSON.stringify(parsed?.marketing?.text)}`
    );
    check(
      'consent_receipt carries the verbatim HEALTH wording and its own version',
      parsed?.health?.text === 'Store my reason for interest so you can tailor what you send me.' &&
        parsed?.health?.version === '2026-08-15.health.a' &&
        parsed?.health?.version !== parsed?.marketing?.version,
      `health.version = ${parsed?.health?.version}, health.text = ${JSON.stringify(parsed?.health?.text)?.slice(0, 40)}…`
    );
    check(
      'consent_receipt records the legal regime',
      parsed?.regime === 'eea' && parsed?.country === 'NO',
      `regime = ${parsed?.regime}, country = ${parsed?.country}`
    );
  }

  check(
    'legacy columns left empty on the new path',
    cellFor(sheet, 'How They Heard').value === '' && cellFor(sheet, 'Name').value === '',
    'Name and How They Heard blank'
  );
}

console.log('\n  Scenario B2 — the extension fields\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  const { response } = post(sheet, {
    email: 'ola@example.no',
    // `sms_phone` — the wire name the endpoint sends. Writing `phone` here is
    // what let the seam bug hide: the fixture agreed with Code.gs and both
    // disagreed with the endpoint.
    sms_phone: '+4791234567',
    consent_sms: true,
    address_line1: 'Storgata 1',
    address_postal_code: '0150',
    address_country: 'NO',
    consent_postal: true,
    company: 'Acme AS',
  });

  check('write returns the post-append count', Number.isFinite(response?.count), `count = ${response?.count}`);
  check(
    'sms_phone forced to text so Sheets cannot reformat it',
    String(cellFor(sheet, 'sms_phone').value).startsWith("'"),
    JSON.stringify(cellFor(sheet, 'sms_phone').value)
  );
  check(
    'address_postal_code forced to text so 0150 keeps its leading zero',
    String(cellFor(sheet, 'address_postal_code').value) === "'0150",
    JSON.stringify(cellFor(sheet, 'address_postal_code').value)
  );
  check('company stored', cellFor(sheet, 'company').value === 'Acme AS', JSON.stringify(cellFor(sheet, 'company').value));
}

console.log('\n  Scenario B3 — consents withheld, gated data must not land\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  post(sheet, {
    email: 'ola@example.no',
    sms_phone: '+4791234567',
    consent_sms: false,
    address_line1: 'Storgata 1',
    consent_postal: false,
    consent_health: false,
  });
  for (const f of ['sms_phone', 'address_line1']) {
    check(`"${f}" not stored without its consent`, cellFor(sheet, f).value === '', JSON.stringify(cellFor(sheet, f).value));
  }
}

console.log('\n  Scenario B4 — confirmed opt-in: rows persist unconfirmed\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  post(sheet, { email: 'ola@example.no', email_handle: 'ab12cd34ef56', confirmed: false, confirmed_at: null });

  check('row written with confirmed=FALSE', cellFor(sheet, 'confirmed').value === 'FALSE', JSON.stringify(cellFor(sheet, 'confirmed').value));
  check('email_handle stored for lookup', cellFor(sheet, 'email_handle').value === 'ab12cd34ef56', JSON.stringify(cellFor(sheet, 'email_handle').value));

  const { response: c1 } = post(sheet, { action: 'confirm', email_handle: 'ab12cd34ef56', confirmed_at: '2026-08-18T10:00:00.000Z' });
  check('confirm flips the row', c1?.ok === true && cellFor(sheet, 'confirmed').value === 'TRUE', `${JSON.stringify(c1)} cell=${cellFor(sheet, 'confirmed').value}`);
  check('confirmed_at recorded', String(cellFor(sheet, 'confirmed_at').value).startsWith('2026-08-18'), JSON.stringify(cellFor(sheet, 'confirmed_at').value));

  const { response: c2 } = post(sheet, { action: 'confirm', email_handle: 'ab12cd34ef56', confirmed_at: '2026-09-01T10:00:00.000Z' });
  check('confirming twice is idempotent', c2?.already === true && String(cellFor(sheet, 'confirmed_at').value).startsWith('2026-08-18'), JSON.stringify(c2));

  const { response: c3 } = post(sheet, { action: 'confirm', email_handle: 'ffffffffffff', confirmed_at: '2026-08-18T10:00:00.000Z' });
  check('unknown handle -> not_found, nothing mutated', c3?.error === 'not_found', JSON.stringify(c3));

  const { response: c4 } = post(sheet, { action: 'confirm', email_handle: '../../etc', confirmed_at: 'x' });
  check('malformed handle rejected', c4?.error === 'validation', JSON.stringify(c4));

  const rowsAfter = sheet._grid.length - 1;
  check('the unconfirmed row was never deleted', rowsAfter >= 1, `${rowsAfter} data rows retained`);
}

console.log('\n  Scenario B5 — downgrade visibility\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  post(sheet, { email: 'ola@example.no', is_downgraded: true, downgraded_fields: 'dietary channel research_optin' });
  check('is_downgraded flagged on the row', cellFor(sheet, 'is_downgraded').value === 'TRUE', JSON.stringify(cellFor(sheet, 'is_downgraded').value));
  check('dropped field names recorded, so the row looks incomplete',
    String(cellFor(sheet, 'downgraded_fields').value).includes('dietary'),
    JSON.stringify(cellFor(sheet, 'downgraded_fields').value));
}

console.log('\n  Scenario T — wrong-tab and empty-tab guards\n');
{
  const H = OLD_HEADERS;
  const populated = makeSheet(H);

  // The exact live-sheet trap: Sheet1 exists and is empty, Pre-orders has the
  // data. A lookup that succeeds on the wrong tab writes with no error at all.
  const empty = makeSheet(H, []);
  const { response: onEmpty } = post(empty, { email: 'a@example.no' });
  check('empty tab REFUSED, not written to', onEmpty?.error === 'misconfigured', JSON.stringify(onEmpty));
  check('nothing was appended to the empty tab', empty._grid.length === 1, `${empty._grid.length - 1} data rows`);

  const noHeaders = makeSheet(['Notes'], []);
  const { response: onNotes } = post(noHeaders, { email: 'a@example.no' });
  check('tab without an email column REFUSED', onNotes?.error === 'misconfigured', JSON.stringify(onNotes));

  const { response: ok } = post(populated, { email: 'a@example.no' });
  check('populated tab accepted', ok?.ok === true, JSON.stringify(ok));

  check(
    'a config error is distinguishable from a transient one',
    onEmpty?.error === 'misconfigured' && onEmpty?.error !== 'server',
    'misconfigured ≠ server — only one of those is fixed by waiting'
  );
}

console.log('\n  Scenario S — THE SEAM: endpoint output fed straight into Code.gs\n');
{
  // Every other scenario hand-writes a payload and posts it to Code.gs, which
  // tests Code.gs against what the test author BELIEVES the endpoint sends.
  // This one captures what api/waitlist.js actually forwards and feeds that in.
  // The gap between those two is where sms_phone was silently dropped.
  const http = await import('node:http');
  const captured = [];
  const up = http.createServer((q, r) => {
    let b = '';
    q.on('data', (c) => (b += c));
    q.on('end', () => {
      captured.push(JSON.parse(b));
      r.setHeader('Content-Type', 'application/json');
      r.end(JSON.stringify({ ok: true, count: 138 }));
    });
  });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));

  process.env.SHEETS_WEBHOOK_URL = `http://127.0.0.1:${up.address().port}/exec`;
  process.env.SHEETS_WEBHOOK_TOKEN = 'test-token';
  process.env.EMAIL_HASH_PEPPER = 'x'.repeat(64);
  const { default: endpoint } = await import(`../api/waitlist.js?seam=${Date.now()}`);
  const api = http.createServer((q, r) => {
    q.headers['x-real-ip'] = '51.175.3.3';
    q.headers['x-vercel-ip-country'] = 'NO';
    endpoint(q, r);
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));

  const res = await fetch(`http://127.0.0.1:${api.address().port}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'seam@example.no', consent_marketing: true,
      phone: '+4791234567', consent_sms: true, sms_consent_text_version: '2026-08-17.sms.a',
      consent_postal: true, address_line1: 'Storgata 1', address_city: 'Oslo',
      address_postal_code: '0150', address_country: 'NO',
      postal_consent_text_version: '2026-08-17.postal.a',
      consent_health: true, motivation: ['gut_health'], dietary: ['nut_allergy'],
      motivation_consent_text_version: '2026-08-15.health.a',
      utm: { source: 'newsletter' }, form_render_ts: Date.now() - 9000,
    }),
  });
  api.close(); up.close();

  check('endpoint accepted', res.status === 200, `HTTP ${res.status}`);
  const forwarded = captured[0];
  check('endpoint forwarded a payload', Boolean(forwarded), forwarded ? `${Object.keys(forwarded).length} keys` : 'NOTHING');

  if (forwarded) {
    const sheet = makeSheet(OLD_HEADERS);
    post(sheet, forwarded, forwarded.token);
    // Anything the endpoint gated ON must survive the trip. A key renamed on
    // one side of the seam and not the other lands as an empty cell.
    // Double-sanitising is the failure this catches: both layers guard formula
    // injection correctly, and composing them stored "''+47…".
    for (const col of ['sms_phone', 'address_postal_code', 'zip']) {
      const v = String(cellFor(sheet, col).value);
      check(`seam: ${col} sanitised exactly once`, !v.startsWith("''"), JSON.stringify(v || '(empty)'));
    }

    // DERIVED, not hand-listed. Every non-null value the endpoint forwards must
    // land in some column. A hand-written list of columns to check is the same
    // failure as a hand-written list of keys — price_band_other was added to
    // the schema, reached the endpoint, and had no column, and the previous
    // fixed list could not have noticed.
    {
      const skip = new Set(['token', 'action', 'utm', 'consents']);
      const dropped = Object.entries(forwarded)
        .filter(([k, v]) => !skip.has(k) && v !== null && v !== '' && v !== false)
        .filter(([k]) => cellFor(sheet, k).missing);
      check(
        'seam: every forwarded field has a column (derived, not listed)',
        dropped.length === 0,
        dropped.length ? `NO COLUMN FOR: ${dropped.map(([k]) => k).join(', ')}` : `${Object.keys(forwarded).length} fields, all placed`
      );
    }

    for (const [col, why] of [
      ['sms_phone', 'consent-gated phone'],
      ['address_line1', 'consent-gated address'],
      ['address_postal_code', 'international postal code'],
      ['dietary', 'Art 9 dietary'],
      ['motivation', 'Art 9 motivation'],
      ['utm_source', 'decomposed utm'],
      ['email_handle', 'confirmation lookup key'],
      ['consent_receipt', 'evidence blob'],
    ]) {
      const c = cellFor(sheet, col);
      check(`seam: ${col} survives (${why})`, !c.missing && String(c.value) !== '', JSON.stringify(String(c.value).slice(0, 46)));
    }
    check('seam: confirmed written as FALSE, not blank',
      String(cellFor(sheet, 'confirmed').value) === 'FALSE',
      JSON.stringify(cellFor(sheet, 'confirmed').value));
  }
}

console.log('\n  Scenario C — health data without the separate consent\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  post(sheet, { email: 'a@example.no', motivation: ['gut_health'], consent_health: false });
  check(
    'motivation dropped when consent_health is false',
    cellFor(sheet, 'motivation').value === '',
    `motivation cell = ${JSON.stringify(cellFor(sheet, 'motivation').value)}`
  );
}

console.log('\n  Scenario D — case-insensitive header matching\n');
{
  const sheet = makeSheet(['Timestamp', 'E-Mail', 'Consent Timestamp']);
  post(sheet, { email: 'b@example.no', consent_timestamp: '2026-08-15T00:00:00Z' });
  const headers = sheet._grid[0];
  check(
    'existing "E-Mail" reused, no second email column',
    headers.filter((h) => normalize(h) === 'email').length === 1,
    `headers: ${headers.join(', ')}`
  );
  check(
    'existing "Consent Timestamp" reused, no second consent_timestamp column',
    headers.filter((h) => normalize(h) === 'consenttimestamp').length === 1,
    `headers: ${headers.join(', ')}`
  );
  function normalize(h) {
    return String(h).trim().toLowerCase().replace(/[\s_-]+/g, '');
  }
}

console.log('\n  Scenario E — auth\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  const { sandbox, responses } = loadScript(sheet, 'real-token');
  sandbox.doPost({ postData: { contents: JSON.stringify({ email: 'x@y.no', token: 'wrong' }) } });
  check('wrong token rejected', responses[0]?.error === 'forbidden', JSON.stringify(responses[0]));

  const { sandbox: s2, responses: r2 } = loadScript(makeSheet(OLD_HEADERS), 'real-token');
  s2.doPost({ postData: { contents: JSON.stringify({ email: 'x@y.no' }) } });
  check('missing token rejected', r2[0]?.error === 'forbidden', JSON.stringify(r2[0]));
}

console.log('\n  Final header row after migration:\n');
{
  const sheet = makeSheet(OLD_HEADERS);
  post(sheet, { email: 'z@example.no' });
  sheet._grid[0].forEach((h, i) => {
    const col = String.fromCharCode(65 + (i % 26));
    const prefix = i >= 26 ? 'A' : '';
    console.log(`      ${(prefix + col).padEnd(4)} ${h}`);
  });
}

console.log(`\n  ${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
process.exit(failures ? 1 : 0);
