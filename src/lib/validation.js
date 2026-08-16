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

/**
 * Registry of consent wordings, keyed by the identifier the client sends as
 * `consent_text_version`.
 *
 * GDPR Art 7(1) puts the burden of proof on us: we must be able to demonstrate
 * that consent was given. "They ticked a box" is not demonstrable on its own —
 * the question a regulator asks is *what exactly were they shown when they
 * ticked it*, and the answer has to be reconstructable years later.
 *
 * Which is why this maps an id to the **verbatim text**, not just to a date. An
 * id alone is only useful while something can still resolve it, and the code
 * that resolves it will have changed a dozen times by then. Storing the
 * resolved wording in each consent receipt makes every record self-contained.
 *
 * ── FOR THE CONVERSION AGENT ──────────────────────────────────────────────
 * You own the wording; I own storing it. When you change either consent line,
 * add a NEW entry here rather than editing an existing one — editing would
 * retroactively rewrite what past signups are recorded as having agreed to,
 * which is the precise thing this exists to prevent. Old entries stay forever
 * so historical records remain resolvable.
 */
export const CONSENT_TEXTS = {
  '2026-08-15.marketing.a': {
    purpose: 'marketing',
    regime: 'global',
    text: 'Email me when pre-orders open. You can unsubscribe any time.',
  },
  '2026-08-15.health.a': {
    purpose: 'health',
    regime: 'global',
    text: 'Store my reason for interest so you can tailor what you send me.',
  },
};

/**
 * Resolve a version id to its wording.
 *
 * An unknown id does NOT fail the request. Rejecting would mean that a
 * Conversion-agent deploy which forgets to register a new wording breaks every
 * signup on the site — trading a documentation lapse for total data loss, which
 * is a far worse outcome than a slightly weaker evidence record. Instead the
 * signup is accepted, the receipt records `registry_match: false`, and the
 * anomaly is logged so it gets fixed. The wording itself stays recoverable from
 * the client's git history.
 */
export function resolveConsentText(version, expectedPurpose = null) {
  const id = typeof version === 'string' && version ? version : null;
  if (!id) {
    return {
      version: 'unspecified',
      text: null,
      registry_match: false,
      purpose: expectedPurpose,
      regime: 'unknown',
    };
  }

  const entry = CONSENT_TEXTS[id];
  return {
    version: id,
    text: entry ? entry.text : null,
    registry_match: Boolean(entry),
    purpose: entry ? entry.purpose : expectedPurpose,
    regime: consentRegime(id),
  };
}

/**
 * Which legal regime a consent wording was written for.
 *
 * The registry is authoritative where it knows the id. Otherwise the id itself
 * is parsed, because the Conversion agent versions its copy by audience —
 * `mkt-us-…` versus `mkt-eu-…` — and an unregistered id is exactly the case
 * where we most want a signal rather than a shrug.
 *
 * Tokenised rather than substring-matched: a naive /us/ test would classify
 * `2026-08-15.august.a` as US-targeted, and a wrong regime here produces a
 * wrong re-consent decision.
 */
export function consentRegime(version) {
  const entry = CONSENT_TEXTS[version];
  if (entry?.regime) return entry.regime;

  const tokens = String(version || '').toLowerCase().split(/[-._]+/);
  if (tokens.some((t) => US_TOKENS.has(t))) return 'us';
  if (tokens.some((t) => EEA_TOKENS.has(t))) return 'eea';
  return 'unknown';
}

/**
 * Audience tokens recognised in a version identifier.
 *
 * `eea` is the canonical spelling — it is what the Conversion agent already
 * emits, and re-minting live version ids to match a doc would be the wrong way
 * round. `eu`, `gdpr` and `uk` are accepted as synonyms so nobody has to
 * remember which one this file prefers; a vocabulary that only works if you
 * guess right is a vocabulary that silently fails.
 */
const EEA_TOKENS = new Set(['eea', 'eu', 'gdpr', 'uk']);
const US_TOKENS = new Set(['us', 'usa', 'canspam']);

/**
 * Reconcile the wording someone was actually shown against where they actually
 * were.
 *
 * The failure this catches: a visitor in Oslo is served the US consent copy —
 * because of a VPN, a CDN edge decision, travel, or a cached bundle — ticks the
 * box, and is recorded as consenting under wording that was never written to
 * meet GDPR. Nothing errors. The record looks complete. It would fail an audit
 * precisely because it looks fine.
 *
 * That set is never empty at any real volume, which is the point: it needs to
 * be a queryable column, not a thing someone remembers to check.
 *
 * Only the EEA-person-shown-US-copy direction is flagged. The converse — an EEA
 * wording shown to someone in Texas — over-protects them and breaks nothing, so
 * flagging it would only add noise to the column that matters.
 */
export function reconcileConsentRegime({ country, marketingVersion, healthVersion }) {
  const inEea = isEea(country);
  const marketing = consentRegime(marketingVersion);
  const health = healthVersion ? consentRegime(healthVersion) : null;

  // Two distinct failures, both of which put a record in the queue.
  //
  //   mismatch     — we know the wording was written for the US, and the
  //                  person was in the EEA. A definite problem.
  //   unverifiable — the identifier carries no audience tag, so we cannot say
  //                  what regime the wording was written for. Not proof of a
  //                  problem, but Art 7(1) asks us to *demonstrate* consent,
  //                  and "we cannot tell" is not a demonstration.
  //
  // `unverifiable` used to fall straight through as not-flagged, which meant
  // the weakest evidence state produced the cleanest-looking row. Untagged is
  // the default state of any new identifier, so that was the case most likely
  // to occur and least likely to be noticed.
  const mismatched = [];
  const unverifiable = [];

  if (inEea) {
    if (marketing === 'us') mismatched.push('marketing');
    else if (marketing === 'unknown') unverifiable.push('marketing');

    if (health === 'us') mismatched.push('health');
    else if (health === 'unknown') unverifiable.push('health');
  }

  const base = { country, marketing_regime: marketing, health_regime: health };

  if (mismatched.length) {
    return {
      ...base,
      needs_reconsent: true,
      status: 'mismatch',
      reason: `${mismatched.join('+')}_consent_text_is_us_but_country_is_eea:${country}`,
    };
  }

  if (unverifiable.length) {
    return {
      ...base,
      needs_reconsent: true,
      status: 'unverifiable',
      reason: `${unverifiable.join('+')}_consent_text_regime_untagged_and_country_is_eea:${country}`,
    };
  }

  return { ...base, needs_reconsent: false, status: 'ok', reason: null };
}

// ─── Geography ───────────────────────────────────────────────────────────────

/**
 * EEA member states, plus the UK.
 *
 * Not stored as a field — this exists so the list can be segmented by legal
 * regime, which is the difference between a lawful campaign and an unlawful one
 * (SECURITY.md §5.3). The UK is included because UK GDPR is materially the same
 * for our purposes even though the UK left the EU.
 */
export const EEA_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',            // EU 27
  'IS', 'LI', 'NO',            // EEA EFTA
  'GB',                        // UK GDPR
]);

export function isEea(country) {
  return EEA_COUNTRIES.has(String(country || '').toUpperCase());
}

/**
 * Two-letter ISO 3166-1 country for the requester, derived from their IP by the
 * edge — never asked of the user and never accepted from the request body.
 *
 * Vercel sets `x-vercel-ip-country` and, per its documentation, overwrites
 * `x-forwarded-for` rather than passing through client-supplied values
 * specifically to prevent IP spoofing. So in production this header is
 * platform-controlled. We still validate the shape, because a header that is
 * trustworthy today is a header someone routes around a year from now, and an
 * unvalidated value lands in a spreadsheet cell.
 *
 * Returns `'XX'` when unavailable (local dev, or a platform that does not
 * provide it). An honest unknown beats a wrong guess: this value decides which
 * privacy regime a record falls under.
 */
export function deriveCountry(req) {
  const raw =
    req.headers['x-vercel-ip-country'] ||
    req.headers['cf-ipcountry'] ||
    req.headers['x-country-code'];

  const code = String(raw || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'XX';
}

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

/**
 * A consent-wording identifier. Deliberately narrow: these end up in a
 * spreadsheet cell and in an evidence record, so no delimiters beyond `. _ -`.
 * Notably `+` is not permitted, which is what stops two identifiers being
 * concatenated into one field.
 */
function consentVersionField() {
  return z
    .string()
    .max(64, { message: 'too_long' })
    .regex(/^[A-Za-z0-9._-]+$/, { message: 'illegal_chars' })
    .nullish();
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

    // The ONLY lenient field in this schema. Everything else stays strict.
    //
    // `zip` is a US ZIP code, and the field should only be rendered to US
    // visitors — but that decision is a client-side region guess, and a guess
    // is wrong sometimes. When it is wrong in the US-but-actually-not direction
    // a Norwegian types `0150`, and under strict validation that rejected the
    // *entire submission*: the email went with it.
    //
    // Losing an email is the failure mode this whole endpoint exists to
    // prevent, and a postal code is worth far less than the address it was
    // attached to. So an unrecognised value is dropped to null and the signup
    // proceeds. Deliberate leniency, scoped to this one field, as defence in
    // depth behind the client's guard rather than a replacement for it.
    //
    // A non-string type still fails: that is a malformed client or a probe, not
    // somebody's postcode. Length is bounded by the 8 KB body cap.
    zip: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (typeof v !== 'string') return null;
        const trimmed = v.trim();
        return /^[0-9]{5}$/.test(trimmed) ? trimmed : null;
      }),

    // Health-adjacent. See `consent_health` below — this array is dropped
    // entirely unless that separate opt-in is present.
    motivation: z
      .union([z.array(z.enum(MOTIVATIONS)).max(3, { message: 'too_many' }), z.null()])
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : [...new Set(v)])),

    // Separate, EXPLICIT opt-in for the health-adjacent field.
    //
    // Under GDPR this is not merely good practice. `motivation` values such as
    // gut_health, digestion and doctor_suggested reveal information about a
    // person's health, which makes them special category data under Art 9(1).
    // Processing is prohibited outright unless an Art 9(2) exception applies,
    // and the only one available to us is 9(2)(a): *explicit* consent — a
    // higher bar than the ordinary Art 6(1)(a) consent covering the email
    // address. It must be a separate, unbundled, affirmative act naming the
    // specific data and purpose.
    //
    // Defaults to false, which is the safe direction: absent an unambiguous
    // yes, the answer is no.
    consent_health: z.boolean().optional().default(false),

    // Identifier for the exact wording shown. Client-supplied by necessity —
    // only the client knows which variant it rendered.
    //
    // Note what is deliberately NOT accepted here: `consent_timestamp` and
    // `country`. Both are server-derived, and because this schema is .strict(),
    // a client that tries to supply either gets a 400 rather than having its
    // value quietly trusted. Consent evidence a submitter can forge is not
    // evidence.
    consent_text_version: consentVersionField(),

    // Dedicated identifier for the Art 9 health opt-in wording.
    //
    // Separate field, not a delimited pair inside `consent_text_version`. The
    // whole legal basis for holding `motivation` is that its consent was
    // separate and unbundled from the marketing consent, and a record that
    // packs both into one string does not evidence that — it evidences one
    // combined act, which is the thing Art 9(2)(a) does not accept. The shape
    // of the record should match the shape of the claim it supports.
    motivation_consent_text_version: consentVersionField(),

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
 * A stable, non-reversible handle for an email, safe to write to logs and to
 * store in the rate-limit database.
 *
 * Keyed (HMAC-SHA256), not a plain digest. A plain SHA-256 of an email address
 * is *not* anonymous data: the keyspace of real addresses is small enough to
 * enumerate, so anyone holding the hashes can recover the addresses with a
 * wordlist. Under GDPR Recital 26 that makes a bare hash pseudonymised personal
 * data, which would mean our rate-limit store holds a second copy of the
 * mailing list and inherits every obligation that comes with it.
 *
 * With a server-held key the hash cannot be reversed without also stealing the
 * key, which is a materially stronger pseudonymisation claim and keeps the
 * third-party store out of scope for the list itself.
 *
 * Falls back to an unkeyed digest if no pepper is configured, so the endpoint
 * still works before the env var is set — but logs the downgrade, because
 * silently weakening a privacy control is worse than not having it.
 */
let warnedMissingPepper = false;

export async function emailHandle(email) {
  const pepper = process.env.EMAIL_HASH_PEPPER;
  const encoder = new TextEncoder();
  let bytes;

  if (pepper) {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pepper),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(email)));
  } else {
    if (!warnedMissingPepper) {
      warnedMissingPepper = true;
      console.warn(
        '[validation] EMAIL_HASH_PEPPER is not set. Email handles fall back to an ' +
          'unkeyed SHA-256, which is reversible by enumeration and therefore still ' +
          'personal data under GDPR. See SECURITY.md §5.5.'
      );
    }
    bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(email)));
  }

  // Truncated to 12 hex characters: enough to correlate two log lines about the
  // same person while debugging, short enough that the log is not itself a
  // lookup table for confirming whether a known address is on the list.
  // Never log the address.
  return Array.from(bytes)
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
