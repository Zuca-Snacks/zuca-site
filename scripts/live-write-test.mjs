#!/usr/bin/env node
/**
 * Send ONE self-describing test row to the live Apps Script and prove it landed
 * in the right columns.
 *
 *   export ZUCA_TOKEN='...'                 # never pass it as an argv
 *   node scripts/live-write-test.mjs '<exec-url>'
 *
 * THE DESIGN POINT: every free-text cell contains the name of the column it is
 * supposed to be in. So verifying alignment is not "cross-reference 53 headers
 * against a table" — it is "does each cell name its own column". A single
 * shifted column is then visible at a glance instead of requiring a lookup that
 * can itself be wrong, which is exactly how the runbook's letters went stale.
 *
 * Enum fields cannot carry their own name, so those are listed with their
 * expected value in the report this prints.
 *
 * Writes exactly one row. Reads the count before and after.
 */
import { argv, env, exit } from 'node:process';

const URL_ = argv[2];
const TOKEN = env.ZUCA_TOKEN;
if (!URL_ || !TOKEN) {
  console.error('usage: ZUCA_TOKEN=... node scripts/live-write-test.mjs <exec-url>');
  exit(2);
}

const STAMP = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const EMAIL = `zuca-livetest-${STAMP}@example.com`;

/** Free-text fields: the value names its own column. */
const selfNaming = (k) => `col:${k}`;
const TEXT = [
  'name', 'company', 'motivation_other', 'referral_source_other', 'channel_other',
  'dietary_other', 'price_band_other',
  'address_line1', 'address_line2', 'address_city', 'address_region',
  'address_country',
  'consent_text_version', 'motivation_consent_text_version',
  'sms_consent_text_version', 'postal_consent_text_version',
  'page_path', 'consent_regime_status', 'reconsent_reason',
];

/** Enum / typed fields: expected value is fixed, so it is asserted by eye. */
const TYPED = {
  zip: '00000',
  intent: 'yes',
  price_band: 'other',
  flavor: 'chocolate',
  is_clinician: false,
  referral_source: 'other',
  consent_marketing: true,
  consent_health: true,
  motivation: 'other',
  quantity_band: 'srv_3_5',
  office_interest: 'maybe',
  headcount: '10_49',
  channel: 'other',
  dietary: 'other',
  research_optin: true,
  sms_phone: '+4700000000',
  consent_sms: true,
  address_postal_code: '0000',
  consent_postal: true,
  is_downgraded: false,
  downgraded_fields: '',
  email_handle: 'aaaaaaaaaaaa',
  confirmed: false,
  confirmed_at: '',
  consent_timestamp: new Date().toISOString(),
  country: 'NO',
  needs_reconsent: false,
  consent_ip_prefix: '203.0.113.0/24',
  user_agent: 'zuca-live-write-test',
};

/**
 * Formula-injection canaries. sanitizeCell must render these as inert TEXT.
 * If any cell shows a number, an image, #ERROR!, or a live link, the second
 * sanitisation layer is not running and SECURITY.md S2 is open.
 */
const CANARY = {
  address_line2: '=1+1',
  channel_other: '+IMAGE("https://example.invalid/x.png")',
  dietary_other: '-1-1',
  referral_source_other: '@SUM(A1:A9)',
  motivation_other: '=HYPERLINK("https://example.invalid","click")',
  company: '=IMPORTXML("https://example.invalid","//a")',
};

const payload = { token: TOKEN, email: EMAIL, utm: {} };
for (const k of TEXT) payload[k] = selfNaming(k);
Object.assign(payload, TYPED, CANARY);
for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
  payload.utm[k] = `col:utm_${k}`;
}

const count = async () => {
  // The echo hop is flaky under rapid probing; retry rather than report a
  // network blip as a broken deployment.
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(URL_, { redirect: 'follow' });
      const t = await r.text();
      if (t.trim().startsWith('{')) return JSON.parse(t).count;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return 'unreadable';
};

const before = await count();
console.log(`count before : ${before}`);
console.log(`email        : ${EMAIL}`);

const res = await fetch(URL_, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  redirect: 'follow',
});
const body = await res.text();
console.log(`\nPOST response: ${body.trim().startsWith('{') ? body.trim() : `HTTP ${res.status}, non-JSON (${body.length}b)`}`);

const after = await count();
console.log(`count after  : ${after}`);
console.log(
  typeof before === 'number' && typeof after === 'number'
    ? (after === before + 1 ? '\n✓ exactly one row appended' : `\n✗ count moved by ${after - before}, expected +1`)
    : '\n? count unreadable — check the sheet directly',
);

console.log(`\n─── WHAT TO LOOK FOR ON THE NEW ROW ───────────────────────────────\n`);
console.log(`Sort/scroll to the LAST row. Its Email is ${EMAIL}.\n`);
console.log(`1. SELF-NAMING CELLS — each must read exactly "col:<its own header>".`);
console.log(`   Read across. Any cell naming a DIFFERENT column means alignment is off:`);
for (const k of TEXT) if (!(k in CANARY)) console.log(`     ${k.padEnd(34)} col:${k}`);
for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
  console.log(`     ${('utm_' + k).padEnd(34)} col:utm_${k}`);
}
console.log(`\n2. FORMULA CANARIES — must display as LITERAL TEXT, never evaluate.`);
console.log(`   A number, an image, a blue link or #ERROR! means sanitisation failed:`);
for (const [k, v] of Object.entries(CANARY)) console.log(`     ${k.padEnd(34)} ${v}`);
console.log(`\n3. TYPED VALUES:`);
for (const [k, v] of Object.entries(TYPED)) {
  console.log(`     ${k.padEnd(34)} ${v === '' ? '(blank)' : String(v)}`);
}
console.log(`\n4. LEGACY COLUMNS — must be EMPTY on this row:`);
console.log(`     Phone   How They Heard   Reason   Source`);
console.log(`\n   NOT Name. As of 2026-08-19 the new form writes an optional first`);
console.log(`   name into that same column on purpose, so historical and new rows`);
console.log(`   line up. It should read "col:name" on this row.`);
console.log(`\n   Phone empty matters most: the number went to sms_phone, and the`);
console.log(`   whole point is that consent-gated numbers never touch the legacy`);
console.log(`   column holding 137 numbers nobody consented to.`);
console.log(`\n5. Timestamp is a real date, not text. consent_receipt is JSON`);
console.log(`   starting {"schema":"zuca.consent.v3".`);
