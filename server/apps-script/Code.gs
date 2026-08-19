/**
 * Zuca waitlist — hardened Google Apps Script backend.
 *
 * This is the ENTIRE contents of a NEW, standalone Apps Script project. It is
 * not a patch and not an edit to the script you are running today — that one
 * stays untouched and serving until step 7. Deployment instructions are at the
 * bottom of this file and in SECURITY.md §8 item 3.
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

// ─────────────────────────────────────────────────────────────────────────────
//  THE ONLY LINE YOU EDIT IN THIS FILE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The spreadsheet this writes to.
 *
 * Take it from the sheet's URL — the long string between /d/ and /edit:
 *   https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
 *
 * Leave it as '' ONLY if you created this script from inside the sheet itself
 * (Extensions → Apps Script). A standalone project has no active spreadsheet,
 * and getActiveSpreadsheet() returns null there — which fails with an error
 * that does not mention the real cause.
 */
var SPREADSHEET_ID = '1tJ9pzTYG31u1nmPF-CUnVzFiXtVUZOGjp4o4mF-gaKA';

/**
 * The TAB that holds signups. Not 'Sheet1'.
 *
 * This spreadsheet has both: 'Pre-orders' carries the 137 real signups and
 * 'Sheet1' is empty. With SHEET_NAME = 'Sheet1' the lookup SUCCEEDS — it finds
 * a real tab, matches it, and writes every new signup into the empty one. No
 * error, no warning, and the 137 rows sit untouched next door while the list
 * silently accumulates in the wrong place.
 *
 * The `|| getSheets()[0]` fallback that used to follow this lookup made it
 * worse: a typo here would have written into whatever tab happened to be first.
 * Both are gone. See assertTargetSheet_ below.
 */
var SHEET_NAME = 'Pre-orders';

/**
 * Refuse to write to the target tab if it holds fewer than this many rows.
 *
 * A brand-new empty tab and the right tab must not look the same to this
 * script. The sheet has 137 signups; a target showing 3 means we are pointed
 * somewhere else, and the only safe move is to stop rather than to start a
 * second list that looks plausible for weeks.
 *
 * Set to 0 ONLY when deliberately starting a genuinely fresh sheet.
 */
var MIN_EXPECTED_ROWS = 100;

/**
 * Existing headers this sheet already uses for a concept we also write.
 *
 * `normalizeHeader_` handles case and separators, so `Email` matches `email`.
 * It cannot know that `How They Heard` and `hearAbout` are the same thing —
 * different words, not different punctuation — so without this the script would
 * create a second column beside the populated one and split the data.
 *
 * canonical name -> header text already in the sheet
 */
var COLUMN_ALIASES = {
  hearAbout: 'How They Heard',
};

/**
 * Existing columns this script deliberately NEVER touches.
 *
 * Not an oversight. This list exists because the natural instinct on seeing an
 * unmapped column is to map it, and for both of these that instinct is wrong.
 *
 *   Reason  — the old health answer, captured with no consent of any kind.
 *             Reading or writing it would be processing Art 9 data without a
 *             lawful basis. New health answers go to `motivation`, behind an
 *             explicit opt-in. The historical values stay where they are.
 *
 *   Source  — holds the literal string "landing-page" on all 137 rows. A
 *             constant from the old modal, not attribution: it carries exactly
 *             zero bits. DO NOT alias utm_source to it. Real attribution goes
 *             to the utm_* columns, which are separate and populated.
 *
 * ⚠️ Expect `Source` to read "landing-page" on old rows and BLANK on every new
 * one, since nothing writes it. That gap will look like a meaningful signal —
 * attribution that stopped working, or a handy old/new discriminator. It is
 * neither. It is one dead column and a date.
 */
var NEVER_WRITTEN = ['Reason', 'Source'];

/**
 * Enforce NEVER_WRITTEN rather than merely stating it.
 *
 * As declared it was a comment wearing a variable's name — worse than a plain
 * comment, because a named constant implies a control that was not there. The
 * failure it guards against is somebody later adding 'Source' to COLUMNS to
 * "fix" the unmapped column, which is exactly the instinct the comment warns
 * about and exactly the thing a comment cannot stop.
 */
function assertNeverWritten_() {
  for (var i = 0; i < NEVER_WRITTEN.length; i++) {
    var forbidden = normalizeHeader_(NEVER_WRITTEN[i]);
    for (var j = 0; j < COLUMNS.length; j++) {
      if (normalizeHeader_(COLUMNS[j]) === forbidden) {
        throw new Error(
          'CONFIG: COLUMNS contains "' + COLUMNS[j] + '", which resolves to the ' +
          'never-written column "' + NEVER_WRITTEN[i] + '". See NEVER_WRITTEN for why. ' +
          'Remove it from COLUMNS.'
        );
      }
    }
    if (COLUMN_ALIASES) {
      for (var k in COLUMN_ALIASES) {
        if (normalizeHeader_(COLUMN_ALIASES[k]) === forbidden) {
          throw new Error(
            'CONFIG: COLUMN_ALIASES maps "' + k + '" onto the never-written column "' +
            NEVER_WRITTEN[i] + '". See NEVER_WRITTEN for why.'
          );
        }
      }
    }
  }
}

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
  'price_band_other',
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
  'company',
  'headcount',
  'channel',
  'channel_other',
  'dietary',
  'dietary_other',
  'research_optin',

  // S22, 2026-08-19. business_enquiry MUST be readable at a glance: it is the
  // flag that keeps a shared mailbox off the personal send list, and we
  // promised the person in writing that it would.
  'business_enquiry',
  'business_consent_text_version',
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
  'address_postal_code',
  'address_country',
  'consent_postal',
  'postal_consent_text_version',

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

  // ── Shared and legacy columns ────────────────────────────────────────────────────────
  // `name` is NO LONGER legacy-only. As of 2026-08-19 the new form collects an
  // optional first name and writes it to this same column on purpose, so that
  // historical and current rows line up in one place rather than splitting
  // across a `name_v2`. Safe here in a way it was not for `phone`: a name is
  // not a contact channel, so no query over this column can reach anyone, and
  // consented rows stay identifiable by `consent_timestamp` regardless.
  //
  // `phone` and `hearAbout` remain written ONLY by the OLD modal, which posts
  // straight to this script. Without these entries every one of those values is
  // silently dropped, because a key absent from COLUMNS is never written.
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
var FORCE_TEXT = ['phone', 'sms_phone', 'address_postal_code', 'zip'];

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
    // Do NOT re-prefix something already prefixed. The Vercel function runs its
    // own formula sanitiser first, so a phone arrives here as "'+47…" — adding
    // a second apostrophe stored "''+47…", which Sheets renders as a visible
    // leading quote inside the number. Two correct guards composing into a
    // wrong result; the second one has to be idempotent.
    return forced.charAt(0) === "'" ? forced : "'" + forced;
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

/**
 * A configuration fault, or a transient one?
 *
 * Both used to return {error:'server'}, so "pointed at the wrong tab" looked
 * exactly like "Google had a moment" — and only one of those is fixed by
 * waiting. The sentinel is set at the throw site rather than inferred from the
 * wording, because classifying a fault by searching its prose breaks the first
 * time somebody improves a sentence.
 */
function isConfigError_(err) {
  return !!err && String(err.message).indexOf('CONFIG:') === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ─── Sheet access ────────────────────────────────────────────────────────────

function getSheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  // Say which of the two setups is wrong rather than letting a null propagate
  // into "Cannot read properties of null", which sends you looking at the write
  // path instead of at one blank string near the top of the file.
  if (!ss) {
    throw new Error(
      'CONFIG: No spreadsheet. Either set SPREADSHEET_ID at the top of this file, or ' +
      'create the script from inside the sheet via Extensions -> Apps Script.'
    );
  }

  assertNeverWritten_();

  var sheet = ss.getSheetByName(SHEET_NAME);
  assertTargetSheet_(ss, sheet);
  return sheet;
}

/**
 * Refuse to write into a tab that is not demonstrably the right one.
 *
 * Every check here exists because its absence fails QUIETLY. A wrong-tab write
 * produces no error at any layer: the endpoint returns 200, the counter goes
 * up, the row is real — it is simply in the wrong place, and nothing surfaces
 * that for as long as nobody opens the other tab.
 */
function assertTargetSheet_(ss, sheet) {
  if (!sheet) {
    var names = ss.getSheets().map(function (s) { return s.getName(); });
    throw new Error(
      'CONFIG: ' + 'No tab named "' + SHEET_NAME + '". Tabs in this spreadsheet: ' + names.join(', ') +
      '. Fix SHEET_NAME at the top of this file. NOT falling back to the first tab — ' +
      'a typo must not silently redirect the list.'
    );
  }

  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(1, sheet.getLastColumn());

  if (lastRow < 1) {
    throw new Error(
      'CONFIG: ' + 'Tab "' + SHEET_NAME + '" is completely empty — no header row. This does not ' +
      'look like the signup tab. Check SHEET_NAME, or set MIN_EXPECTED_ROWS = 0 if ' +
      'you really are starting a fresh sheet.'
    );
  }

  // An anchor column proves it is a signup tab rather than a notes tab that
  // happens to have something in row 1.
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var hasEmail = false;
  for (var i = 0; i < headers.length; i++) {
    if (normalizeHeader_(headers[i]) === 'email') hasEmail = true;
  }
  if (!hasEmail) {
    throw new Error(
      'CONFIG: ' + 'Tab "' + SHEET_NAME + '" has no "email" column in row 1. Refusing to write: ' +
      'this is not the signup tab.'
    );
  }

  var dataRows = lastRow - 1;
  if (dataRows < MIN_EXPECTED_ROWS) {
    throw new Error(
      'CONFIG: ' + 'Tab "' + SHEET_NAME + '" holds ' + dataRows + ' rows but at least ' +
      MIN_EXPECTED_ROWS + ' were expected. Refusing to write — an empty or nearly ' +
      'empty tab is what a WRONG tab looks like. If this is deliberate, set ' +
      'MIN_EXPECTED_ROWS = 0.'
    );
  }
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

  // Resolve each canonical column name against what is already in the sheet,
  // including under a different WORD for the same thing (COLUMN_ALIASES).
  var index = {};
  var toAppend = [];
  COLUMNS.forEach(function (c) {
    var at = byNormalized[normalizeHeader_(c)];
    if (!at && COLUMN_ALIASES[c]) at = byNormalized[normalizeHeader_(COLUMN_ALIASES[c])];
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
    // NOT {count: 0}.
    //
    // Zero is a number, and a number renders. Pointed at the wrong tab this
    // showed a working counter reading zero — no error anywhere, just a site
    // quietly announcing that nobody had signed up. The one shape this whole
    // review has been removing: a failure that looks like data.
    //
    // null is not a count. It cannot be formatted, summed or compared by
    // accident, and every consumer has to decide what to do about it.
    console.error('doGet failed: ' + err.message);
    return json_({ count: null, error: isConfigError_(err) ? 'misconfigured' : 'server' });
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
    // A misconfiguration and a transient failure both used to return
    // {error:'server'}, so "wrong tab" was indistinguishable from "Google had a
    // moment" — and only one of those is fixed by waiting. The message goes to
    // the Executions log where an operator actually looks, and the code tells
    // the caller which kind it was.
    console.error('confirmRow_ failed: ' + err.message);
    return json_({ ok: false, error: isConfigError_(err) ? 'misconfigured' : 'server' });
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
      price_band_other: payload.price_band_other,
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

      quantity_band: payload.quantity_band,
      office_interest: payload.office_interest,
      company: payload.company,
      headcount: payload.headcount,
      channel: [].concat(payload.channel || []).join('|'),
      channel_other: payload.channel_other,
      // Art 9, same gate as motivation — the health consent wording names both.
      // Re-checked here rather than trusted: this is the last gate before the
      // data lands somewhere a human opens.
      motivation_other: payload.consent_health ? payload.motivation_other : '',
      dietary: payload.consent_health && payload.dietary ? [].concat(payload.dietary).join('|') : '',
      dietary_other: payload.consent_health ? payload.dietary_other : '',
      research_optin: payload.research_optin,

      // `sms_phone`, not `phone`. The Vercel function renames it on the wire so
      // the consent-gated number never lands in the legacy `phone` column that
      // holds 137 numbers captured without consent. Reading `payload.phone`
      // here silently wrote nothing — the endpoint had already renamed it.
      // Found by the local test drive, because it was the first thing to run
      // both halves in sequence; each suite tested its own side of this seam.
      sms_phone: payload.consent_sms ? payload.sms_phone : '',
      consent_sms: payload.consent_sms,
      sms_consent_text_version: payload.sms_consent_text_version,

      address_line1: payload.consent_postal ? payload.address_line1 : '',
      address_line2: payload.consent_postal ? payload.address_line2 : '',
      address_city: payload.consent_postal ? payload.address_city : '',
      address_region: payload.consent_postal ? payload.address_region : '',
      address_postal_code: payload.consent_postal ? payload.address_postal_code : '',
      address_country: payload.consent_postal ? payload.address_country : '',
      consent_postal: payload.consent_postal,
      postal_consent_text_version: payload.postal_consent_text_version,
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
    console.error('doPost failed: ' + err.message);
    return json_({ ok: false, error: isConfigError_(err) ? 'misconfigured' : 'server' });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ─── Deployment ──────────────────────────────────────────────────────────────
 *
 * ORDER MATTERS. An earlier version of these steps had you archive the old
 * deployment FIRST, which kills the live form from that moment until the new
 * site ships — a self-inflicted outage sitting inside the instructions for
 * avoiding one. Archiving is LAST, and only after a real signup has landed.
 *
 * The old URL stays live and working throughout steps 1-6. Nothing you do
 * before step 7 can take the form down.
 *
 * TWO ACCOUNTS AND TWO PROJECTS. Keep them straight:
 *
 *   OLD  the personal Gmail account that owns the spreadsheet — NOT
 *        emil@zucasnacks.com. It runs the script serving the site today.
 *        DO NOT OPEN IT until step 7. Every step before that happens
 *        somewhere else. If you find yourself editing code that already has
 *        your data-handling in it, you are in the wrong project — stop.
 *
 *   NEW  emil@zucasnacks.com       a new STANDALONE project you create.
 *        Standalone means script.google.com -> New project, NOT
 *        Extensions -> Apps Script from inside the sheet.
 *
 *  0. FIRST, because step 1 cannot work without it: the new project runs as
 *     emil@zucasnacks.com, and this script reaches the sheet with
 *     SpreadsheetApp.openById(). openById can only open a spreadsheet the
 *     executing account can already open.
 *
 *     The sheet is owned by the personal Gmail account. Signed in as that
 *     account, share it with emil@zucasnacks.com as EDITOR
 *     (Share -> add the address -> Editor).
 *     Viewer is not enough; the script writes.
 *
 *     Without this, step 6 fails with a permissions error that names the file
 *     ID and not the cause, which reads like the ID is wrong when it is not.
 *
 *  1. In the NEW project: select everything in the starter file (it contains a
 *     stub `myFunction()` and nothing else) and paste this over it -> Save.
 *
 *     "Paste over the existing file" means that starter stub. It does NOT mean
 *     the script under the personal Gmail account. Do not open that one.
 *
 *     SPREADSHEET_ID and SHEET_NAME are already set. Nothing else to edit.
 *
 *  2. Project Settings (gear) -> Script Properties -> Add script property
 *       name:  ZUCA_TOKEN
 *       value: the 64-character secret, same value as Vercel's
 *              SHEETS_WEBHOOK_TOKEN
 *     The secret is NOT in this file on purpose: this file lives in a public
 *     GitHub repository.
 *
 *  3. Deploy -> New deployment -> type: Web app
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     "Anyone" is still required — Vercel calls this without a Google account.
 *     The token is what authenticates now, not the URL's obscurity.
 *     This is the NEW project's first deployment, so there is nothing here to
 *     overwrite. The old project's deployment lives in the other account
 *     entirely and is not visible from this screen. It stays live and serving.
 *
 *  4. Copy the NEW /exec URL. In Vercel -> Settings -> Environment Variables:
 *       SHEETS_WEBHOOK_URL    = the new /exec URL
 *       SHEETS_WEBHOOK_TOKEN  = the same value as ZUCA_TOKEN
 *     Set both for Production, Preview and Development.
 *
 *  5. Deploy the new site. Until this lands, the old client is still posting to
 *     the OLD deployment, which is still live. That is the point of the order.
 *
 *  6. VERIFY WITH A REAL SIGNUP before going further:
 *       - private window, fill the form properly, take more than 2 seconds
 *       - a new row appears on the "Pre-orders" tab (NOT Sheet1)
 *       - CHECK BY HEADER NAME, NOT COLUMN LETTER. Read row 1, find the
 *         column headed `Email`, and confirm your address is in it on the new
 *         row. Then the same for `consent_marketing` and `consent_receipt`.
 *
 *         An earlier version of this step said "column C has your email".
 *         Column C is `Phone`. Following it would have shown you an empty
 *         cell and told you the pipeline was broken while it was working.
 *         This script matches on header TEXT and ignores position entirely,
 *         so the header is the only thing that is actually load-bearing —
 *         and `node scripts/sheet-columns.mjs` prints the letters if you
 *         want them, derived rather than remembered.
 *       - delete the test row
 *     If nothing appears, check Apps Script -> Executions. `misconfigured`
 *     means a settings problem — wrong tab, wrong token. `server` means
 *     something transient; retry before changing anything.
 *
 *  7. ⚠️ ONLY NOW, and this is the first and only step that touches the old
 *     account: sign in as the personal Gmail account, open the OLD project,
 *     Deploy -> Manage deployments -> archive the deployment.
 *
 *     IRREVERSIBLE UNTIL REDEPLOYED. Archiving permanently kills that URL —
 *     un-archiving does not bring it back, and a new deployment gets a new
 *     address. Any client still pointing at the old URL breaks instantly and
 *     silently, because the old modal used mode:"no-cors" and cannot read a
 *     rejection.
 *
 *     Do this only once step 6 has actually passed. Skipping it leaves the
 *     public, write-capable URL alive, which is the finding this whole exercise
 *     exists to close.
 *
 *  8. Confirm the old URL is dead:
 *       curl -sL "<OLD_URL>"             -> no longer returns {"count":N}
 *     and that the new one refuses unauthenticated writes:
 *       curl -sL "<NEW_URL>" -H 'Content-Type: application/json' \
 *            -d '{"email":"x@example.com"}'    -> {"ok":false,"error":"forbidden"}
 *
 *     ⚠️ NOTE THE ABSENCE OF `-X POST`. It is not a style choice and the
 *     earlier version of this command had it, which made the command wrong.
 *
 *     Apps Script ALWAYS answers /exec with a 302 to script.googleusercontent,
 *     and the real response body is at the redirect. `-d` makes the first
 *     request a POST and lets curl follow that 302 as a GET, which is what the
 *     echo URL serves. `-X POST` pins the method to EVERY hop, so the follow-up
 *     hits the echo URL as a POST, gets 405, and curl prints Google's
 *     "Sorry, unable to open the file at this time" HTML page.
 *
 *     That page looks exactly like a broken deployment. Running the old command
 *     against a perfectly good deployment would have told you it was broken,
 *     and the natural next move — re-deploying, re-pasting, re-checking the
 *     sheet ID — would all have been fixing something that was not wrong.
 *     Verified against the live deployment on 2026-08-18.
 */

