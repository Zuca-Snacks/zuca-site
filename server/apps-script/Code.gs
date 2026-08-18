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

/**
 * Columns written, in order. Missing ones are appended to row 1 on first use.
 *
 * Header matching is CASE-INSENSITIVE and whitespace-tolerant (see
 * `ensureColumns_`), so an existing `Email` column is reused rather than having
 * a second `email` created beside it.
 */
var COLUMNS = [
  'timestamp',
  'email',
  'zip',
  'intent',
  'price_band',
  'flavor',
  'is_clinician',
  'referral_source',
  'referral_source_other',
  'consent_marketing',
  'consent_health',
  'motivation',
  'motivation_other',

  // ── Extension 2026-08-17 ───────────────────────────────────────────────
  'quantity_band',
  'office_interest',
  'company_name',
  'company_headcount',
  'channel',
  'channel_other',
  'dietary',
  'dietary_other',
  'research_optin',
  // NOT 'phone'. The existing sheet already has a `phone` column holding 137
  // legacy numbers captured by the old modal with no consent of any kind.
  // Writing consent-gated numbers into that same column would make the two
  // indistinguishable except by a blank-vs-FALSE reading of `consent_sms` —
  // and the failure mode of getting that wrong is texting somebody who never
  // agreed to be texted. Separate column, separate meaning.
  'sms_phone',
  'consent_sms',
  'sms_consent_text_version',
  'address_line1',
  'address_line2',
  'address_city',
  'address_region',
  'address_postal',
  'address_country',
  'consent_mail',
  'mail_consent_text_version',

  // Downgrade visibility: a record written without its extensions must LOOK
  // incomplete, not normal. See api/waitlist.js.
  'is_downgraded',
  'downgraded_fields',

  // Confirmed opt-in. A row is written with confirmed=FALSE and stays that way
  // until the link is clicked. It is never deleted for being unconfirmed —
  // filter the SEND LIST on confirmed=TRUE, and keep the whole sheet as the
  // demand record.
  'email_handle',
  'confirmed',
  'confirmed_at',

  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'page_path',
  'consent_text_version',
  'motivation_consent_text_version',
  'consent_timestamp',
  'country',
  'needs_reconsent',
  'consent_regime_status',
  'reconsent_reason',
  'consent_receipt',
  'consent_ip_prefix',
  'user_agent',

  // ── Legacy columns ────────────────────────────────────────────────────────
  // Written only by the OLD modal, which posts straight to this script and
  // sends `name`, `phone` and `hearAbout`. Without these entries every one of
  // those values is silently dropped, because a key absent from COLUMNS is
  // never written anywhere.
  //
  // They are kept as separate columns rather than folded into `referral_source`
  // on purpose: the two use different vocabularies (`physician` vs `doctor`,
  // `social` vs `instagram`), and merging them would quietly corrupt the
  // meaning of the historical values. Backfill deliberately, once, by hand.
  //
  // Note what is NOT here: legacy `reason`. See `LEGACY_KEYS` below.
  'name',
  'phone',
  'hearAbout',
];

/**
 * Keys the old modal sends that we still accept.
 *
 * `reason` is deliberately absent. It is the health-related field — Art 9
 * special category data — and the old modal captures no consent for it at all.
 * Storing it would be unlawful, so it is dropped.
 *
 * That drop is intentional, and it is the one case where "the data disappears"
 * is the correct behaviour rather than the bug. It is logged on every occurrence
 * so it is a *known* drop and not a silent one. Once the new form ships with its
 * separate health opt-in, the same information arrives as `motivation` with
 * `consent_health: true` and is stored normally.
 */
var LEGACY_KEYS = ['name', 'phone', 'hearAbout'];

// ─── Safety ──────────────────────────────────────────────────────────────────

/**
 * Per-column length caps. Default is 500 — long enough for any real answer,
 * short enough that a junk payload cannot bloat the sheet.
 *
 * `consent_receipt` is the exception. It is a JSON document, and truncating
 * JSON does not shorten it, it *destroys* it: the result is unparseable, which
 * turns the one artefact meant to prove consent into a broken string at exactly
 * the moment someone needs to read it. 4000 is comfortably above the ~550 a
 * full receipt occupies, and still far below Sheets' 50k cell limit.
 */
var CELL_MAX_DEFAULT = 500;
var CELL_MAX = { consent_receipt: 4000, user_agent: 250, downgraded_fields: 1000 };

/**
 * Columns Sheets would otherwise mangle. A leading "+" makes sanitizeCell_ add
 * its apostrophe anyway, but these are listed explicitly so the intent survives
 * a future edit to the formula guard: a phone number silently reformatted into
 * a number, or a postal code losing its leading zero, is data loss that looks
 * like data.
 */
var FORCE_TEXT = ['phone', 'sms_phone', 'address_postal', 'zip'];

/**
 * Neutralize spreadsheet formula injection and cell-breaking characters.
 *
 * The leading apostrophe forces Sheets to treat the value as text. It is not
 * displayed in the cell and is not part of the stored string.
 */
function sanitizeCell_(value, column) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return value;

  var limit = (column && CELL_MAX[column]) || CELL_MAX_DEFAULT;
  if (column && FORCE_TEXT.indexOf(column) !== -1) {
    var forced = String(value).replace(/[\r\n\t]/g, ' ').trim();
    if (forced === '') return '';
    return /^['=+\-@]/.test(forced) ? "'" + forced : "'" + forced;
  }
  var s = String(value).replace(/[\r\n\t]/g, ' ').trim();
  if (s.length > limit) s = s.slice(0, limit);
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
function normalizeHeader_(h) {
  // Case- and separator-insensitive. An existing column called "Email",
  // "E-mail" or "consent ts" should be recognised as ours rather than
  // duplicated beside a new one. Getting this wrong is silent and expensive:
  // half the rows land in one column and half in its twin.
  return String(h).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function ensureColumns_(sheet) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });

  // Map normalized header -> 1-based column.
  var byNormalized = {};
  headers.forEach(function (h, i) {
    if (h) byNormalized[normalizeHeader_(h)] = i + 1;
  });

  // Resolve each canonical column name against what is already in the sheet.
  var index = {};
  var toAppend = [];
  COLUMNS.forEach(function (c) {
    var at = byNormalized[normalizeHeader_(c)];
    if (at) {
      index[c] = at;
    } else {
      toAppend.push(c);
    }
  });

  if (toAppend.length) {
    // `headers.length` rather than getLastColumn(): a sheet whose last columns
    // are blank reports a shorter lastColumn and we would overwrite real data.
    var firstNew = headers.length + 1;
    sheet.getRange(1, firstNew, 1, toAppend.length).setValues([toAppend]);
    toAppend.forEach(function (c, i) {
      index[c] = firstNew + i;
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

/**
 * Mark one row confirmed. Idempotent: confirming twice is a no-op, so a
 * double-clicked link or a mail client that prefetches URLs cannot corrupt the
 * timestamp of an already-confirmed row.
 */
function confirmRow_(handle, confirmedAt) {
  if (!/^[0-9a-f]{12}$/.test(handle)) return json_({ ok: false, error: 'validation' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  }

  try {
    var sheet = getSheet_();
    var index = ensureColumns_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2 || !index.email_handle) return json_({ ok: false, error: 'not_found' });

    var handles = sheet.getRange(2, index.email_handle, lastRow - 1, 1).getValues();
    for (var i = handles.length - 1; i >= 0; i--) {
      if (String(handles[i][0]).trim() !== handle) continue;

      var row = i + 2;
      if (index.confirmed) {
        if (String(sheet.getRange(row, index.confirmed).getValue()).toUpperCase() === 'TRUE') {
          return json_({ ok: true, already: true });
        }
        sheet.getRange(row, index.confirmed).setValue('TRUE');
      }
      if (index.confirmed_at) {
        sheet.getRange(row, index.confirmed_at).setNumberFormat('@').setValue(confirmedAt);
      }
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'not_found' });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
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

  // ── action: confirm ───────────────────────────────────────────────────────
  // Flips an existing row to confirmed. Looks the row up by `email_handle`, a
  // keyed hash, so the confirmation path never needs the address itself.
  if (payload.action === 'confirm') {
    return confirmRow_(String(payload.email_handle || ''), String(payload.confirmed_at || ''));
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
      referral_source_other: payload.referral_source_other,
      // Same consent gate as `motivation` itself: the free-text answer to a
      // health question is health data, and re-checked here rather than trusted
      // because this is the last gate before it lands somewhere a human opens.
      motivation_other: payload.consent_health ? payload.motivation_other : '',

      quantity_band: payload.quantity_band,
      office_interest: payload.office_interest,
      company_name: payload.company_name,
      company_headcount: payload.company_headcount,
      channel: [].concat(payload.channel || []).join('|'),
      channel_other: payload.channel_other,
      // Art 9, same gate as motivation — the health consent wording names both.
      dietary: payload.consent_health && payload.dietary ? [].concat(payload.dietary).join('|') : '',
      dietary_other: payload.consent_health ? payload.dietary_other : '',
      research_optin: payload.research_optin,

      sms_phone: payload.consent_sms ? payload.phone : '',
      consent_sms: payload.consent_sms,
      sms_consent_text_version: payload.sms_consent_text_version,

      address_line1: payload.consent_mail ? payload.address_line1 : '',
      address_line2: payload.consent_mail ? payload.address_line2 : '',
      address_city: payload.consent_mail ? payload.address_city : '',
      address_region: payload.consent_mail ? payload.address_region : '',
      address_postal: payload.consent_mail ? payload.address_postal : '',
      address_country: payload.consent_mail ? payload.address_country : '',
      consent_mail: payload.consent_mail,
      mail_consent_text_version: payload.mail_consent_text_version,
      email_handle: payload.email_handle,
      confirmed: payload.confirmed,
      confirmed_at: payload.confirmed_at,
      is_downgraded: payload.is_downgraded,
      downgraded_fields: payload.downgraded_fields,

      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      utm_content: utm.content,
      utm_term: utm.term,
      page_path: payload.page_path,
      consent_text_version: payload.consent_text_version,
      motivation_consent_text_version: payload.motivation_consent_text_version,
      consent_timestamp: payload.consent_timestamp,
      country: payload.country,
      needs_reconsent: payload.needs_reconsent,
      consent_regime_status: payload.consent_regime_status,
      reconsent_reason: payload.reconsent_reason,
      consent_receipt: payload.consent_receipt,
      consent_ip_prefix: payload.consent_ip_prefix,
      user_agent: payload.user_agent,

      // Legacy keys from the old modal. Absent on the new path, which is fine —
      // sanitizeCell_ turns undefined into an empty cell.
      name: payload.name,
      phone: payload.phone,
      hearAbout: payload.hearAbout,
    };

    // Legacy `reason` is health data with no consent behind it. Dropped on
    // purpose (see LEGACY_KEYS), but logged so the drop is visible in
    // Executions rather than silent.
    if (payload.reason) {
      console.log('legacy_reason_dropped: no Art 9 consent on the legacy path');
    }

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
      if (at) rowValues[at - 1] = sanitizeCell_(values[col], col);
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

    // Return the post-write count. This is what lets the caller update the
    // live counter without a follow-up GET, which is the only way to be
    // certain the number reflects the write that just happened rather than a
    // cached value from before it.
    return json_({ ok: true, count: Math.max(0, sheet.getLastRow() - 1) });
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
