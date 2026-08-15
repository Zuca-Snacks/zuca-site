/**
 * Server-side validation for POST /api/waitlist.
 *
 * This is the ONLY validation that matters. Anything the browser checks is a
 * convenience for the user, not a control — an attacker never runs our JS.
 *
 * Implements the frozen data contract in AGENTS_BRIEF.md exactly. Unknown keys
 * are rejected rather than stripped: a payload carrying fields we did not ask
 * for means either a client we do not control or someone probing for mass
 * assignment, and both are worth a 400.
 */

import { z } from 'zod';

// ─── Limits ──────────────────────────────────────────────────────────────────

export const MAX_BODY_BYTES = 8 * 1024; // 8 KB. The largest legitimate payload is well under 1 KB.
export const MIN_FILL_MS = 2000; // Faster than a human can read the form, let alone fill it.
export const MAX_FORM_AGE_MS = 12 * 60 * 60 * 1000; // Stale timestamp = replayed or forged.

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * CR and LF in a field that may end up in an email header (To:, Subject:,
 * a Sheets cell exported to CSV) let an attacker inject additional headers or
 * rows. NUL and the Unicode direction-override characters are here for a
 * different reason: they make a string render as something other than what is
 * stored, which is how "support@zuca.com" gets displayed for a value that is
 * not that at all.
 */
// Written as escape sequences, not literal characters. Every one of these is
// invisible in an editor, and a regex nobody can read is a regex nobody will
// maintain correctly.
//   \r \n            header and CSV-row injection
//   \u0000           NUL, truncates the string in some downstream consumers
//   \u202A-\u202E    bidi embedding and override — the "RTL trick", which makes
//                    a stored value render as something else entirely
//   \u2066-\u2069    bidi isolates: same attack, newer encoding
// eslint-disable-next-line no-control-regex -- matching a control char is the point
const FORBIDDEN_CHARS = /[\r\n\u0000\u202A-\u202E\u2066-\u2069]/;

/**
 * Unicode tricks, in the order they must be applied.
 *
 * NFKC first: it folds the compatibility forms an attacker uses to slip past
 * a later check (ﬁ → fi, ＠ → @, and the full-width Latin block generally).
 * Then strip zero-width characters, which are invisible but make two visually
 * identical emails compare unequal — the cheapest way to defeat duplicate
 * detection. Then collapse whitespace and trim.
 */
function normalizeText(value) {
  return value
    .normalize('NFKC')
    // \u200B-\u200D zero-width space/non-joiner/joiner, \uFEFF BOM,
    // \u00AD soft hyphen. All render as nothing and all defeat string equality.
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    // Collapse every Unicode space separator, not just ASCII — a non-breaking
    // space or an ideographic space reads as a space but compares as neither.
    .replace(/[\t\f\v\p{Zs}]+/gu, ' ')
    .trim();
}

/** A trimmed, normalized, header-injection-free string with a hard length cap. */
function safeString(max) {
  return z
    .string()
    .max(max * 4, { message: 'too_long' }) // Cheap pre-check before we spend cycles normalizing.
    .transform(normalizeText)
    .refine((v) => !FORBIDDEN_CHARS.test(v), { message: 'illegal_chars' })
    .refine((v) => v.length <= max, { message: 'too_long' });
}

/** Treats "" and "  " as absent, so an untouched optional input is not a validation error. */
function optionalEnum(values) {
  return z
    .union([z.enum(values), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v));
}

// ─── Email ───────────────────────────────────────────────────────────────────

/**
 * Deliberately "RFC-lite", per the contract. Full RFC 5322 accepts addresses
 * that no mail provider will deliver to, and every regex claiming to implement
 * it is either wrong or unreadable. This accepts what real inboxes look like
 * and rejects the rest; the confirmation email is the real validator.
 */
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}$/;

/**
 * Role addresses. Mail to these reaches a shared mailbox or a ticket queue, not
 * a person who opted in — so it is both useless to us and a fast route to an
 * abuse complaint. `abuse@` and `postmaster@` in particular are monitored by
 * the people who decide whether our domain is a spam source.
 */
const ROLE_LOCALPARTS = new Set([
  'abuse', 'admin', 'administrator', 'all', 'billing', 'compliance', 'contact',
  'devnull', 'everyone', 'ftp', 'help', 'hostmaster', 'info', 'legal', 'list',
  'mail', 'mailer-daemon', 'marketing', 'noc', 'no-reply', 'noreply', 'null',
  'office', 'postmaster', 'privacy', 'root', 'sales', 'security', 'spam',
  'support', 'sysadmin', 'team', 'test', 'usenet', 'uucp', 'webmaster',
]);

/**
 * Disposable domains. This list is intentionally short and high-confidence —
 * the long crowd-sourced lists on GitHub carry real false positives, and
 * rejecting a genuine signup costs more than accepting a throwaway one.
 * Bot volume is handled by rate limiting and the honeypot; this list exists to
 * catch the specific providers that spamtrap-seed marketing lists.
 */
const DISPOSABLE_DOMAINS = new Set([
  '0-mail.com', '10minutemail.com', '20minutemail.com', 'anonbox.net',
  'discard.email', 'dispostable.com', 'fakeinbox.com', 'getairmail.com',
  'getnada.com', 'guerrillamail.com', 'guerrillamail.info', 'inboxbear.com',
  'mail-temporaire.fr', 'mailcatch.com', 'maildrop.cc', 'mailinator.com',
  'mailnesia.com', 'mintemail.com', 'mohmal.com', 'mytemp.email',
  'sharklasers.com', 'spam4.me', 'spamgourmet.com', 'temp-mail.org',
  'tempinbox.com', 'tempmail.net', 'tempmailo.com', 'throwawaymail.com',
  'trashmail.com', 'yopmail.com', 'yopmail.fr',
]);

const emailSchema = z
  .string()
  .max(320, { message: 'too_long' })
  .transform((v) => normalizeText(v).toLowerCase())
  .refine((v) => v.length <= 254, { message: 'too_long' }) // RFC 5321 path limit.
  .refine((v) => !FORBIDDEN_CHARS.test(v), { message: 'illegal_chars' })
  .refine((v) => EMAIL_RE.test(v), { message: 'invalid_email' })
  .refine((v) => !v.includes('..'), { message: 'invalid_email' })
  .refine((v) => !ROLE_LOCALPARTS.has(v.split('@')[0]), { message: 'role_address' })
  .refine((v) => !DISPOSABLE_DOMAINS.has(v.split('@')[1]), { message: 'disposable' });

// ─── Contract ────────────────────────────────────────────────────────────────

export const MOTIVATIONS = [
  'digestion', 'regularity', 'gut_health', 'energy',
  'sustainability', 'doctor_suggested', 'family_health', 'other',
];
export const INTENTS = ['preorder_now', 'very_interested', 'curious', 'just_browsing'];
export const PRICE_BANDS = ['lt_24', '24_29', '30_35', '36_42', 'gt_42'];
export const FLAVORS = ['choc_rasp_salt', 'maple_pecan', 'both', 'undecided'];
export const REFERRAL_SOURCES = [
  'doctor', 'friend', 'instagram', 'tiktok', 'event', 'search', 'email', 'other',
];

const utmSchema = z
  .object({
    source: safeString(64).nullish(),
    medium: safeString(64).nullish(),
    campaign: safeString(64).nullish(),
    content: safeString(64).nullish(),
    term: safeString(64).nullish(),
  })
  .strict()
  .nullish();

export const waitlistSchema = z
  .object({
    email: emailSchema,

    // `consent_marketing` must be the boolean `true`. Not "true", not 1 — an
    // affirmative act, recorded as one, because it is the thing we would have
    // to produce if the opt-in is ever challenged.
    consent_marketing: z.literal(true, { message: 'consent_required' }),

    zip: z
      .union([z.string().regex(/^[0-9]{5}$/, { message: 'invalid_zip' }), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),

    // Health-adjacent. See `consent_health` below — this array is dropped
    // entirely unless that separate opt-in is present.
    motivation: z
      .union([z.array(z.enum(MOTIVATIONS)).max(3, { message: 'too_many' }), z.null()])
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : [...new Set(v)])),

    // Separate, explicit opt-in for the health-adjacent field, per the brief.
    // Not part of the frozen contract because the contract predates the
    // requirement it states; defaults to false, which is the safe direction.
    consent_health: z.boolean().optional().default(false),

    intent: optionalEnum(INTENTS),
    price_band: optionalEnum(PRICE_BANDS),
    flavor: optionalEnum(FLAVORS),
    referral_source: optionalEnum(REFERRAL_SOURCES),

    is_clinician: z.boolean().nullish().transform((v) => (v === undefined ? null : v)),

    utm: utmSchema.transform((v) => v ?? null),
    page_path: safeString(200).nullish().transform((v) => v ?? null),

    // Bot signals. Validated, then consumed by the endpoint and never stored.
    hp_field: z.string().max(256).nullish(),
    form_render_ts: z.number().int().positive().nullish(),
  })
  .strict(); // Reject unknown keys outright.

// ─── Bot heuristics ──────────────────────────────────────────────────────────

/**
 * Returns a reason string if the submission looks automated, else null.
 *
 * These are the zero-friction layers. A real user never trips them: the
 * honeypot is hidden, and nobody reads a consent line and fills an email in
 * under two seconds. Only if these prove insufficient in production should a
 * challenge (Turnstile) be added — and then only on suspicion, never on the
 * happy path. See HANDOFF-sec.md.
 */
export function detectBot(data, now = Date.now()) {
  // A hidden field that only a form-filler would populate.
  if (typeof data.hp_field === 'string' && data.hp_field.trim() !== '') return 'honeypot';

  if (typeof data.form_render_ts === 'number') {
    const elapsed = now - data.form_render_ts;
    if (elapsed < MIN_FILL_MS) return 'too_fast';
    // A timestamp in the future, or one from yesterday, means the value was
    // fabricated or the page was left open long enough for the session to be
    // worthless as a signal.
    if (elapsed < -60_000) return 'clock_skew';
    if (elapsed > MAX_FORM_AGE_MS) return 'stale_form';
  }

  return null;
}

// ─── Spreadsheet safety ──────────────────────────────────────────────────────

/**
 * Neutralize spreadsheet formula injection.
 *
 * Google Sheets and Excel evaluate any cell whose value begins with =, +, -,
 * or @. A formula can make outbound requests, so a single crafted "first name"
 * exfiltrates the whole sheet the moment someone opens it. Prefixing with an
 * apostrophe forces the cell to text; the apostrophe is not displayed and is
 * not part of the stored value.
 *
 * Tab and CR are stripped first because they can terminate a cell early and
 * push the payload into the next one, past this guard.
 *
 * Applied here AND again in the Apps Script — this is the last line of defence
 * before data lands somewhere a human will open, and it is cheap.
 */
export function sanitizeForSheet(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitizeForSheet);
  if (typeof value !== 'string') return value;

  const cleaned = value.replace(/[\r\n\t]/g, ' ').trim();
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

/** Apply `sanitizeForSheet` across every string in a record, one level deep plus `utm`. */
export function sanitizeRecord(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? sanitizeRecord(value)
        : sanitizeForSheet(value);
  }
  return out;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

/**
 * A stable, non-reversible handle for an email, safe to write to logs.
 *
 * Truncating to 12 hex characters is deliberate: enough to correlate two log
 * lines about the same person while debugging, short enough that the log is not
 * itself a lookup table for confirming whether a known address is on the list.
 * Never log the address.
 */
export async function emailHandle(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return Array.from(new Uint8Array(digest))
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate a parsed body against the contract.
 * Returns `{ ok: true, data }` or `{ ok: false, issues }` — never throws.
 */
export function validateWaitlist(body) {
  const result = waitlistSchema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };

  // Field names and rule names only. Issue messages never echo the submitted
  // value, so a log line cannot become a copy of the payload.
  const issues = result.error.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    code: i.code,
    rule: i.message,
  }));
  return { ok: false, issues };
}
