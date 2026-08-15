/**
 * Zuca waitlist — hardened Google Apps Script backend.
 *
 * REPLACES the entire contents of your current Apps Script file. Deployment
 * instructions are at the bottom of this file and in SECURITY.md §8 item 3.
 *
 * What changed and why:
 *
 *  1. `doPost` now requires a shared secret (`X-Zuca-Token`, also accepted in
 *     the JSON body because Apps Script does not expose request headers to
 *     `doPost`). Without it, anyone who finds the URL can write. The URL is
 *     currently public, so this is the control that actually protects the
 *     sheet — see SECURITY.md S1/S3.
 *
 *  2. Every value is passed through `sanitizeCell` before it is written.
 *     Google Sheets evaluates cells beginning `=`, `+`, `-` or `@` as formulas,
 *     and formulas can make outbound network requests. A crafted name field
 *     could exfiltrate the whole sheet the next time you open it — SECURITY.md
 *     S2. This is enforced here as well as in the Vercel function, on purpose:
 *     this is the last gate before the data lands somewhere a human opens.
 *
 *  3. `doGet` returns only a count. It never returns rows, under any parameter.
 *
 *  4. Rows are written by matching column headers in row 1, so this script
 *     works with your existing sheet layout and adds columns for new fields
 *     rather than overwriting anything.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Read from Script Properties, never hardcoded here — this file lives in a
 * public GitHub repository.
 *
 * Set it once: Apps Script editor → Project Settings (gear) → Script Properties
 * → Add script property → name `ZUCA_TOKEN`, value = a long random string.
 * Generate one with:  openssl rand -hex 32
 * Put the same value in Vercel as SHEETS_WEBHOOK_TOKEN.
 */
function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('ZUCA_TOKEN');
}

/** Sheet tab that holds signups. Change if yours is named differently. */
var SHEET_NAME = 'Sheet1';

/** Columns written, in order. Missing ones are appended to row 1 on first use. */
var COLUMNS = [
  'timestamp',
  'email',
  'zip',
  'intent',
  'price_band',
  'flavor',
  'is_clinician',
  'referral_source',
  'consent_marketing',
  'consent_health',
  'motivation',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'page_path',
  'consent_ts',
  'consent_ip_prefix',
  'user_agent',
];

// ─── Safety ──────────────────────────────────────────────────────────────────

/**
 * Neutralize spreadsheet formula injection and cell-breaking characters.
 *
 * The leading apostrophe forces Sheets to treat the value as text. It is not
 * displayed in the cell and is not part of the stored string.
 */
function sanitizeCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return value;

  var s = String(value).replace(/[\r\n\t]/g, ' ').trim();
  if (s.length > 500) s = s.slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/**
 * Constant-time-ish string comparison.
 *
 * Apps Script is not a realistic timing-attack target — the platform's own
 * scheduling noise dwarfs any signal — but comparing the full length costs
 * nothing and removes the question.
 */
function secureEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ─── Sheet access ────────────────────────────────────────────────────────────

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

/**
 * Map column name → 1-based index, creating any column that does not exist.
 * Preserves whatever columns are already in the sheet, in place.
 */
function ensureColumns_(sheet) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });

  var index = {};
  headers.forEach(function (h, i) {
    if (h) index[h] = i + 1;
  });

  var toAppend = COLUMNS.filter(function (c) {
    return !index[c];
  });

  if (toAppend.length) {
    sheet.getRange(1, headers.length + 1, 1, toAppend.length).setValues([toAppend]);
    toAppend.forEach(function (c, i) {
      index[c] = headers.length + 1 + i;
    });
  }

  return index;
}

// ─── Read path ───────────────────────────────────────────────────────────────

/**
 * GET → { count }. Nothing else, ever.
 *
 * Deliberately ignores every query parameter. There is no filter, no offset and
 * no "return rows" mode, so there is nothing here to enumerate.
 */
function doGet() {
  try {
    var sheet = getSheet_();
    var count = Math.max(0, sheet.getLastRow() - 1); // minus the header row
    return json_({ count: count });
  } catch (err) {
    return json_({ count: 0 });
  }
}

// ─── Write path ──────────────────────────────────────────────────────────────

function doPost(e) {
  var token = getToken_();

  // Refuse to run unauthenticated. If the property is missing this is a
  // misconfiguration, and the safe response to a misconfigured auth check is to
  // deny, not to allow.
  if (!token) {
    return json_({ ok: false, error: 'server' });
  }

  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'validation' });
  }

  // Apps Script does not surface request headers to doPost, so the token is
  // read from the body. It travels over TLS to Google and is never logged.
  if (!secureEquals_(String(payload.token || ''), token)) {
    return json_({ ok: false, error: 'forbidden' });
  }

  // The Vercel function has already validated against the full contract. This
  // is a sanity floor, not a substitute for it.
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email || email.length > 254 || email.indexOf('@') < 1) {
    return json_({ ok: false, error: 'validation' });
  }

  // Serialize writes. Two concurrent appends can otherwise land on the same row
  // and one silently overwrites the other.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  }

  try {
    var sheet = getSheet_();
    var index = ensureColumns_(sheet);
    var utm = payload.utm || {};

    var values = {
      timestamp: new Date(),
      email: email,
      zip: payload.zip,
      intent: payload.intent,
      price_band: payload.price_band,
      flavor: payload.flavor,
      is_clinician: payload.is_clinician,
      referral_source: payload.referral_source,
      consent_marketing: payload.consent_marketing,
      consent_health: payload.consent_health,
      // Health-adjacent. The Vercel function already blanks this when the
      // separate health opt-in is absent; storing it here without that consent
      // would defeat the control, so re-check rather than trust.
      motivation: payload.consent_health && payload.motivation
        ? [].concat(payload.motivation).join('|')
        : '',
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      utm_content: utm.content,
      utm_term: utm.term,
      page_path: payload.page_path,
      consent_ts: payload.consent_ts,
      consent_ip_prefix: payload.consent_ip_prefix,
      user_agent: payload.user_agent,
    };

    var row = sheet.getLastRow() + 1;
    var width = Math.max.apply(
      null,
      COLUMNS.map(function (c) {
        return index[c] || 0;
      })
    );

    var rowValues = new Array(width).fill('');
    COLUMNS.forEach(function (col) {
      var at = index[col];
      if (at) rowValues[at - 1] = sanitizeCell_(values[col]);
    });

    // Force the whole row to plain text before writing. Belt and braces with
    // sanitizeCell_ — a text-formatted cell will not evaluate a formula even if
    // one slipped through.
    var range = sheet.getRange(row, 1, 1, width);
    range.setNumberFormat('@');
    range.setValues([rowValues]);

    // Timestamp is the one column we want as a real date, not text.
    if (index.timestamp) {
      sheet.getRange(row, index.timestamp).setNumberFormat('yyyy-mm-dd hh:mm:ss').setValue(new Date());
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ─── Deployment ──────────────────────────────────────────────────────────────
 *
 *  1. Apps Script editor → paste this over the entire existing file → Save.
 *
 *  2. Project Settings (gear icon) → Script Properties → Add script property
 *       name:  ZUCA_TOKEN
 *       value: output of `openssl rand -hex 32`
 *
 *  3. Deploy → Manage deployments → ARCHIVE the existing deployment.
 *     This is the step that kills the currently-public URL. Creating a new
 *     deployment without archiving the old one leaves the old URL live and
 *     writable, which fixes nothing.
 *
 *  4. Deploy → New deployment → type: Web app
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     "Anyone" is still required — Vercel calls this without a Google account.
 *     The token is what provides authentication now, not the URL's obscurity.
 *
 *  5. Copy the new /exec URL. In Vercel → Settings → Environment Variables:
 *       SHEETS_WEBHOOK_URL    = the new /exec URL
 *       SHEETS_WEBHOOK_TOKEN  = the same value as ZUCA_TOKEN
 *     Set both for Production, Preview and Development. Redeploy.
 *
 *  6. Verify the old URL is dead:
 *       curl -s "<OLD_URL>"      → should no longer return {"count":N}
 *     and that the new one rejects unauthenticated writes:
 *       curl -s -X POST "<NEW_URL>" -H 'Content-Type: application/json' \
 *            -d '{"email":"x@y.com"}'
 *                                  → {"ok":false,"error":"forbidden"}
 */
