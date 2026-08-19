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
import { GENERATED_CONSENT_TEXTS } from './consent-registry.generated.js';

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
const BUILTIN_CONSENT_TEXTS = {
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
  // Names medication explicitly, which the wording above does not. A signup
  // selecting a medication value against the OLDER wording is rejected: the
  // sentence they read did not mention it, so their consent does not cover it.
  // The business basis (S22), approved by Emil 2026-08-19. Verbatim, because
  // `consentCoversBusiness` tests THIS STRING — the wording is not decoration
  // around the basis, for a shared mailbox it IS the basis.
  //
  // The narrowing to the office conversation is a constraint on us, not a
  // courtesy: a mailbox nobody personally consented from can only support a
  // purpose genuinely about the organisation. Mailing it about a consumer
  // launch does not weaken this basis, it removes it.
  /**
   * ⚠️ PRE-MERGE FIXTURE. NOT the production id.
   *
   * Production is Conversion's fingerprinted `biz-eea-2026-08-19-fc6ba471`,
   * generated from their copy.js by scripts/build-consent-registry.mjs. This
   * entry exists only so the S22 gate is testable on a branch where
   * src/content/copy.js does not exist yet.
   *
   * It is deleted at merge, and the suite FAILS if it is not — see
   * "the pre-merge business fixture is retired at merge" in the attack suite.
   * A hand-maintained entry in a generated registry is precisely what the
   * generator was written to prevent, so it does not get to survive on trust.
   *
   * TEXT IS EMIL'S APPROVED WORDING VERBATIM. The first version of this entry
   * silently rewrote it into the third person — "Zuca will email" for "We'll
   * email", "it will not be added to Zuca's" for "we won't add it to our".
   * Conversion caught it. If they render his sentence and the registry stores
   * mine, the consent evidence is not what the person read, which is the exact
   * defect the fingerprint exists to make impossible.
   */
  '2026-08-19.business.a': {
    purpose: 'business',
    regime: 'global',
    text:
      "I'm asking on behalf of my workplace. This is a business enquiry, not a " +
      "personal signup. We'll email this address about stocking Zuca at work — " +
      'nothing else — and anyone reading this inbox can stop it by replying to ' +
      "that email. Because it's a shared address, we won't add it to our " +
      'personal mailing list.',
  },
  '2026-08-19.health-medication.a': {
    purpose: 'health',
    regime: 'global',
    text:
      "I'm happy to tell Zuca why fiber matters to me, anything dietary it " +
      "should know, and whether I'm taking a medication such as a GLP-1. This " +
      'is health information and it is optional: it is stored with my signup, ' +
      'never sold, never sent to an advertising or analytics tool, and I can ' +
      'ask Zuca to delete it at any time.',
  },
  '2026-08-17.sms.a': {
    purpose: 'sms',
    regime: 'global',
    text: 'Text me about my order and when pre-orders open. Message rates may apply. Reply STOP to opt out.',
  },
  '2026-08-17.postal.a': {
    purpose: 'postal',
    regime: 'global',
    text: 'Post me samples and product news at the address above.',
  },
};

/**
 * The live registry: wordings resolved from the Conversion agent's copy.js at
 * build time, plus the built-in fallbacks above.
 *
 * Generated entries win. They are derived from the actual source of the text a
 * user saw, so where the two disagree the generated one is the true record and
 * the built-in is a stale guess.
 *
 * Regenerate with `npm run build:consent` — it runs as part of `npm run build`,
 * so a copy change cannot ship with a stale registry.
 */
export const CONSENT_TEXTS = { ...BUILTIN_CONSENT_TEXTS, ...GENERATED_CONSENT_TEXTS };

/** The four consent purposes, and the field each one gates. */
export const CONSENT_PURPOSES = {
  marketing: { flag: 'consent_marketing', version: 'consent_text_version', gates: null },
  health: { flag: 'consent_health', version: 'motivation_consent_text_version', gates: 'motivation' },
  sms: { flag: 'consent_sms', version: 'sms_consent_text_version', gates: 'phone' },
  mail: { flag: 'consent_postal', version: 'postal_consent_text_version', gates: 'address' },
  business: { flag: 'business_enquiry', version: 'business_consent_text_version', gates: 'role_address' },
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
export function reconcileConsentRegime({
  country,
  marketingVersion,
  healthVersion,
  smsVersion,
  postalVersion,
  businessVersion,
}) {
  const inEea = isEea(country);

  // Every consent granted is assessed, not just the first two. A postal opt-in
  // taken under US wording from someone in Oslo is the same defect as a
  // marketing one, and there is now more than one way to acquire it.
  const present = [
    ['marketing', marketingVersion],
    ['health', healthVersion],
    ['sms', smsVersion],
    ['postal', postalVersion],
    ['business', businessVersion],
  ].filter(([, v]) => v);

  const regimes = {};
  for (const [name, version] of present) regimes[name] = consentRegime(version);

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
    for (const [name] of present) {
      if (regimes[name] === 'us') mismatched.push(name);
      else if (regimes[name] === 'unknown') unverifiable.push(name);
    }
  }

  const base = {
    country,
    regimes,
    // Retained for readability of existing records and dashboards.
    marketing_regime: regimes.marketing ?? consentRegime(marketingVersion),
    health_regime: regimes.health ?? null,
  };

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

/**
 * 8 KB. A maximal VALID payload — every field present, every string at its cap,
 * every multi-select fully chosen — measures 2956 bytes after the 2026-08-17
 * extension, leaving 2.8x headroom.
 *
 * This comment said "well under 1 KB" until 2026-08-19. That was true when it
 * was written and the extension tripled the field count without anyone
 * re-measuring — a hand-maintained derived number, the same failure as the
 * runbook's column letters.
 *
 * DO NOT TIGHTEN THIS FROM THE COMMENT. The stale figure was dangerous
 * precisely because it invited one: read "under 1 KB", set the cap to 2 KB with
 * apparently generous margin, and start rejecting people who filled the form in
 * properly. The attack suite measures the real maximum and prints the margin —
 * change the cap only against a number that run produces.
 */
export const MAX_BODY_BYTES = 8 * 1024;
export const MIN_FILL_MS = 2000; // Faster than a human can read the form, let alone fill it.
export const MAX_FORM_AGE_MS = 12 * 60 * 60 * 1000; // Stale timestamp = replayed or forged.

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * CR and LF in a field that may end up in an email header (To:, Subject:,
 * a Sheets cell exported to CSV) let an attacker inject additional headers or
 * rows. NUL and the Unicode direction-override characters are here for a
 * different reason: they make a string render as something other than what is
 * stored, which is how "support@example.com" gets displayed for a value that is
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
/**
 * C0 and C1 control characters that get STRIPPED rather than rejected.
 *
 * Deliberately EXCLUDES \u0000, \r and \n — those stay in FORBIDDEN_CHARS and
 * are still a hard rejection. Stripping them here would silently downgrade an
 * existing security control into a cleanup, which is the worse kind of change
 * because the tests would keep passing.
 *
 * Also excludes \t \u000B \u000C: normalizeText already folds them to a space,
 * and "a<TAB>b" should read "a b", not "ab".
 *
 * What is left — \u0001-\u0008, \u000E-\u001F, DEL, and the C1 block — is
 * invisible junk. A bell character in a first name is never intentional, so
 * stripping loses nothing a person meant to type, and unlike rejecting it
 * cannot 400 a submission somebody cannot see the problem with.
 *
 * Added 2026-08-19, AFTER Conversion shipped the same strip client-side. Order
 * matters: this is a REMOVE-class change, so the client goes first. Doing it
 * server-side while an older client was still posting would have turned
 * payloads that client considers valid into rejections in flight.
 */
// eslint-disable-next-line no-control-regex -- matching control chars is the point
const STRIPPED_CONTROLS = /[\u0001-\u0008\u000E-\u001F\u007F-\u009F]/g;

function safeString(max) {
  return z
    .string()
    .max(max * 4, { message: 'too_long' }) // Cheap pre-check before we spend cycles normalizing.
    // Strip BEFORE normalizing so the space-collapse and trim run afterwards:
    // "a <BEL> b" becomes "a b", not "a  b".
    .transform((v) => normalizeText(v.replace(STRIPPED_CONTROLS, '')))
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

/**
 * A multi-select over an enum.
 *
 * No product cap on how many can be picked — "choose up to 3" makes someone
 * rank reasons they hold equally, and the answer we get back is then a ranking
 * artefact rather than what is true of them.
 *
 * The remaining bound is arithmetic, not policy: after de-duplication an array
 * of enum members cannot contain more distinct values than the enum has, so the
 * cap is exactly that. It exists to stop a payload of ten thousand repeated
 * values costing a de-dup pass, not to shape an answer. Per-item validity is
 * the enum itself, and total payload size is the 8 KB body limit.
 */
function multiEnum(values) {
  return z
    .union([z.array(z.enum(values)).max(values.length, { message: 'too_many' }), z.null()])
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : [...new Set(v)]));
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
  // NOTE: the role-address check is NOT here. It moved to superRefine on
  // 2026-08-19 because it now depends on `business_enquiry`, a sibling field
  // this schema cannot see. `disposable` stays — a throwaway domain is not a
  // workplace, and nothing about the business basis makes it one.
  .refine((v) => !DISPOSABLE_DOMAINS.has(v.split('@')[1]), { message: 'disposable' });

// ─── Contract ────────────────────────────────────────────────────────────────

export const MOTIVATIONS = [
  'digestion', 'regularity', 'gut_health', 'energy',
  'sustainability', 'doctor_suggested', 'family_health',
  // Added 2026-08-19. Both are facts about the person and neither raises the
  // sensitivity of this field beyond what it already carries — they sit inside
  // the same `consent_health` gate as the rest.
  'fullness', 'whole_foods',
  // Accepted ONLY alongside a health consent whose wording names medication.
  'glp1_medication',
  'other',
];

/** Motivation values that require the medication-naming consent. */
export const MEDICATION_MOTIVATIONS = new Set(['glp1_medication']);

/**
 * Does the wording this person actually saw cover medication?
 *
 * Tested against the verbatim text rather than a flag on the registry entry,
 * because the Conversion agent derives its version ids by fingerprinting the
 * copy — a flag would have to be maintained alongside, and this week has been a
 * catalogue of hand-maintained lists drifting from the thing they describe.
 *
 * Reading the text has a property a flag cannot: edit the copy to drop the
 * mention and the gate closes by itself, on the same deploy. It is also the
 * literal legal question — Art 9(2)(a) consent must be specific to the
 * processing, and the sentence either names it or does not.
 *
 * Fails closed. An unresolved version has no text, so it covers nothing.
 */
/**
 * Does this wording actually tell the person it is a BUSINESS enquiry?
 *
 * Same test as `consentCoversMedication`, for the same reason: read what the
 * person was shown, not a flag we set ourselves. A boolean says somebody sent
 * `business_enquiry: true`; the verbatim text is the only evidence that the
 * sentence establishing the basis was on the screen.
 *
 * Matters more here than for medication. A shared mailbox gives no individual's
 * consent at all, so the wording is not decorating the basis — it IS the basis.
 */
export function businessConsentGaps(resolvedText) {
  if (typeof resolvedText !== 'string' || !resolvedText) return ['no_text'];
  const gaps = [];

  // 1. Asserts an ORGANISATIONAL context. Without this the row is a personal
  //    signup from a shared mailbox, which is the thing we refuse.
  // `\bmy workplace\b`, not `\bworkplace\b`. Narrowed from the old alternation
  // on 2026-08-19 and NOT flagged at the time — Conversion found it because
  // their transcribed copy still had the wide form. Retained deliberately now
  // that it is a decision rather than an accident: the possessive is what makes
  // it a claim about the sender's own employer rather than a passing mention of
  // workplaces. `on behalf of` still catches "on behalf of the workplace", so a
  // reasonable rephrasing is not stranded by it.
  if (!/\bon behalf of\b|\bmy workplace\b|\bbusiness (?:enquiry|inquiry)\b/i.test(resolvedText)) {
    gaps.push('basis');
  }

  // 2. The exclusion promise. THIS IS THE ONE MY CODE IMPLEMENTS — a business
  //    row is stored with consent_marketing FALSE precisely because the wording
  //    says so. If the sentence loses it, the code and the copy have diverged,
  //    and checking for it is checking that they still agree.
  if (!/\bmailing list\b/i.test(resolvedText) || !/\b(?:won'?t|will not|never|not)\b/i.test(resolvedText)) {
    gaps.push('exclusion');
  }

  // 3. A stated route out. A shared mailbox is read by people who never signed
  //    up, so "reply to stop" is the only opt-out any of them can use.
  if (!/\brepl(?:y|ying)\b|\bunsubscribe\b|\bstop\b/i.test(resolvedText)) {
    gaps.push('stop_mechanism');
  }

  return gaps;
}

/**
 * Does this wording actually establish the BUSINESS basis?
 *
 * ⚠️ THIS WAS AN ALTERNATION UNTIL 2026-08-19 AND IT WAS NOT A GATE.
 *
 *   /on behalf of|workplace|business enquiry/i
 *
 * Any ONE of three phrases satisfied it, so a single incidental mention passed.
 * Conversion found it by mutation — replacing the first-person assertion still
 * matched on a phrase further down — and checking their finding against my own
 * gate showed it was worse than their example:
 *
 *   "Tell us about your workplace."     PASSED
 *
 * A sentence that asserts nothing, promises nothing, and is not a consent
 * statement at all. Everything downstream would still have behaved perfectly:
 * flag set, version resolved, marketing suppressed, receipt self-consistent.
 * The only missing thing would have been what made it lawful, and every
 * mechanism built to protect it would have reported success.
 *
 * Now a CONJUNCTION of the three load-bearing elements. `businessConsentGaps`
 * names which are missing so a rejected wording says why, rather than failing
 * as an unexplained 400 on a copy edit.
 *
 * NOT CHECKED, and worth knowing: the purpose narrowing ("about stocking Zuca
 * at work — nothing else"). It is the element doing the most legal work and the
 * hardest to match without becoming brittle. Human review of copy changes is
 * still load-bearing; this is a backstop, not a substitute.
 *
 * ⚠️ ENGLISH ONLY. Norwegian copy would fail every element and close the office
 * path entirely. Fail-closed, so nothing unlawful is stored — but it dies
 * silently from a translator's point of view. See HANDOFF §1n.
 */
export function consentCoversBusiness(resolvedText) {
  return businessConsentGaps(resolvedText).length === 0;
}

export function consentCoversMedication(resolvedText) {
  if (typeof resolvedText !== 'string' || !resolvedText) return false;
  return /\bmedicat|\bGLP-?\s?1\b/i.test(resolvedText);
}

/**
 * `glp1_medication` is Art 9 at the hard end.
 *
 * Approved 2026-08-19 under the standing instruction to build Cooley items as
 * signed off. The reasoning against is kept rather than deleted, because the
 * decision is meant to be reversible and a decision you cannot see the argument
 * for is not reversible in practice.
 *
 * The argument against was never phrasing — "I'm on a GLP-1 medication" is
 * correctly a fact about the person rather than a product effect. It was
 * necessity: the health-claim guardrails forbid GLP-1 and weight-loss claims,
 * so the segment is special category data we may not market to on that basis.
 * That has not changed. **Approving collection is not approving use.**
 *
 * What makes collection defensible is that it is gated on a consent that names
 * medication in the words the person actually read — see `consentCoversMedication`.
 * Not a separate boolean: a boolean can be true while the sentence beside it
 * says nothing about medication, and Art 9(2)(a) asks what they were told, not
 * what flag we set.
 */export const INTENTS = ['preorder_now', 'very_interested', 'curious', 'just_browsing'];
/**
 * Price per 12-pack. The five predecessors were removed 2026-08-19 once the
 * client stopped sending them; their boundaries differed, so rows written
 * before the switch are a separate series and cannot be mapped onto these.
 *
 * `gt_45` rather than `45_plus` — it matches the `gt_42` / `gt_30` convention,
 * and the $44–45 gap the rename was meant to close is a label problem, fixed by
 * labelling it "$45 or more".
 */
export const PRICE_BANDS = ['25_34', '35_44', 'gt_45', 'other'];
export const FLAVORS = ['choc_rasp_salt', 'maple_pecan', 'both', 'undecided'];
/**
 * Servings per month. The bite-counting predecessors were removed 2026-08-19
 * once the client stopped sending them.
 *
 * The `srv_` prefix stays even though nothing unprefixed is accepted any more,
 * because THE SHEET STILL HOLDS THE OLD VALUES. Rows written before the switch
 * carry `9_16` and friends, counting bites, and a serving is five bites — so
 * pooling the two generations produces a number that means nothing. The prefix
 * is what makes that obvious in a query rather than quiet.
 *
 * Dropping it later because "everything is servings now" would be true of the
 * enum and false of the data.
 */
export const QUANTITY_BANDS = ['srv_1_2', 'srv_3_5', 'srv_6_10', 'srv_11_20', 'srv_gt_20'];

/** Company size, for the office-snack path. Bands, not a number — a headcount
 *  typed as free text is unusable for segmentation and more identifying. */
export const HEADCOUNTS = ['lt_10', '10_49', '50_199', '200_999', 'gt_1000'];

/** Tri-state, not a boolean. "Maybe" is the most common honest answer to
 *  "would you want these at work?", and collapsing it into no loses the
 *  entire middle of the office-pilot funnel. */
export const OFFICE_INTERESTS = ['yes', 'maybe', 'no'];

/**
 * Dietary needs. THIS IS ART 9 HEALTH DATA — a nut allergy is a health fact
 * exactly as a health motivation is — so it is gated on `consent_health`, the
 * same explicit opt-in, whose wording names both.
 */
export const DIETARY = ['none', 'nut_allergy', 'gluten_free', 'dairy_free', 'vegan', 'low_sugar', 'other'];

/** Where they would expect to buy. Not health data, not gated. */
export const CHANNELS = ['online_dtc', 'grocery', 'gym_studio', 'office', 'clinic', 'other'];

export const REFERRAL_SOURCES = [
  'doctor', 'friend', 'instagram', 'tiktok', 'event', 'search', 'email', 'other',
];

/**
 * E.164. Strict, deliberately — unlike `zip`, which fails soft.
 *
 * The difference is intent. A postal-code field rendered by a wrong region
 * guess is a field the visitor never asked to see; a phone number is something
 * they chose to type, and silently discarding it while recording an SMS consent
 * against nothing would be worse than telling them it is wrong. The client must
 * validate inline so this 400 is never the first the user hears of it. See
 * HANDOFF-sec.md if that tradeoff should be revisited.
 */
const phoneSchema = z
  .string()
  .max(32, { message: 'too_long' })
  .transform((v) => normalizeText(v).replace(/[\s\-().]/g, ''))
  .refine((v) => !FORBIDDEN_CHARS.test(v), { message: 'illegal_chars' })
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), { message: 'invalid_phone' });

/**
 * A real mailing address postal code — international, so NOT the same thing as
 * the `zip` field. `zip` is a US-only shipping-region signal that fails soft;
 * this one is part of an address someone expects post to arrive at, so it
 * accepts Norwegian `0150`, UK `SW1A 1AA` and Brazilian `01000-000` alike.
 * Two fields, two purposes, deliberately not merged.
 */
const postalCodeSchema = z
  .string()
  .max(16, { message: 'too_long' })
  .transform((v) => normalizeText(v))
  .refine((v) => /^[A-Za-z0-9][A-Za-z0-9 -]{1,14}$/.test(v), { message: 'invalid_postal_code' });

/** ISO 3166-1 alpha-2, supplied by the user. Distinct from `country`, which the
 *  server derives from the request IP and the client may not set. */
const addressCountrySchema = z
  .string()
  .transform((v) => normalizeText(v).toUpperCase())
  .refine((v) => /^[A-Z]{2}$/.test(v), { message: 'invalid_country' });

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
    motivation: multiEnum(MOTIVATIONS),

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

    // ── Extension 2026-08-17 ────────────────────────────────────────────────
    // Purely additive. No existing field changed shape; the 137 rows already in
    // the sheet keep their meaning, and every new column is appended.

    quantity_band: optionalEnum(QUANTITY_BANDS),
    channel: multiEnum(CHANNELS),
    channel_other: safeString(120).nullish().transform((v) => v || null),

    // Art 9 health data — allergies and dietary restrictions are health facts.
    // Gated on `consent_health`, whose wording names dietary needs explicitly.
    dietary: multiEnum(DIETARY),
    // 60, not 120. Art 9 health data, and the cap is the minimisation: bound
    // how much can be typed, since "sesame" and "low FODMAP" fit comfortably
    // and a medical history does not. `motivation_other` carries the same cap
    // for the same reason.
    dietary_other: safeString(60).nullish().transform((v) => v || null),

    // A preference about email we are already permitted to send, so it narrows
    // contact rather than widening it and needs no separate consent.
    research_optin: z.boolean().nullish().transform((v) => (v === undefined ? null : v)),

    // Office-snack path. Free text goes through the same normalise →
    // reject-control-chars → length-cap path as every other free-text field,
    // and is formula-sanitised before it reaches a cell.
    office_interest: optionalEnum(OFFICE_INTERESTS),
    company: safeString(80).nullish().transform((v) => v || null),

    /**
     * First name, optional. Added 2026-08-19.
     *
     * NOT a new field on the sheet — it maps onto the `Name` column the old
     * modal already wrote to, so historical and new rows line up in one place.
     * That is safe here in a way it explicitly was NOT for `phone`, and the
     * difference is worth stating because the two look alike:
     *
     *   A name is not a contact channel. The phone hazard was that "text
     *   everyone with a number" would reach 137 people who never agreed, so
     *   the consented numbers needed a column of their own. There is no query
     *   over the name column that contacts anybody — you cannot send to a
     *   name — so merging costs nothing and the rows stay distinguishable by
     *   `consent_timestamp` anyway.
     *
     * Cap 40, agreed with Conversion so the two caps are EQUAL rather than
     * each independently reasonable — the failure mode we already hit once,
     * where a client cap of 120 above a server cap of 40 turned the gap into
     * a 400. 40 is first-name-only: Emil does not ask for a surname, and the
     * privacy policy's entry already reads "First name (optional)".
     *
     * No pairing rule and no consent gate. `consent_marketing` is mandatory —
     * the schema rejects its absence AND its being false — so there is no such
     * thing as a stored row without it, and gating this on a condition that
     * holds for every row would be a control that never fires.
     */
    name: safeString(40).nullish().transform((v) => v || null),

    /**
     * "I'm asking on behalf of my workplace." Added 2026-08-19 (S22).
     *
     * The ONLY thing that permits a role address (office@, info@, team@).
     * Rejecting those was losing exactly the audience the office-snack path was
     * built to reach — the list literally contains 'office'.
     *
     * My first proposal gated this on `office_interest`, and Conversion was
     * right that it cannot work: the email is validated on step 1 screen 0 and
     * `office_interest` is collected on screen 4. It gated on a field that does
     * not exist yet at the moment of the rejection.
     */
    business_enquiry: z.boolean().nullish().transform((v) => v === true),
    business_consent_text_version: safeString(64).nullish().transform((v) => v || null),
    headcount: optionalEnum(HEADCOUNTS),

    // A free-text escape for the enums that offer "Other". Pairing is enforced
    // below in `superRefine`: text without the matching "other" selection is a
    // client bug or a probe, and text arriving when a real enum value was
    // chosen would be silently unreadable data.
    //
    // Reinstated 2026-08-19, reversing its removal the day before.
    //
    // The removal argument was that a dropdown bounds what we can learn about
    // someone's health and an open box does not — people write things in open
    // boxes they would never pick from a list. That reasoning was sound and is
    // kept here rather than deleted; what changed is that the Art 9 hold was
    // lifted, not that the argument was wrong.
    //
    // 60, matching `dietary_other` and half the 120 the non-health boxes get.
    // Same gate as the rest of the health block: dropped entirely without
    // `consent_health`, and paired to an actual "other" selection below.
    motivation_other: safeString(60).nullish().transform((v) => v || null),

    referral_source_other: safeString(120).nullish().transform((v) => v || null),

    // Freehand price. Stored verbatim, never parsed: "£30ish", "$25-30",
    // "40 NOK a bar" and "depends on the size" are all legitimate answers, and
    // a number extracted from any of them would be a guess presented as data.
    // Normalised, control chars rejected, capped, and formula-sanitised before
    // it reaches a cell — that last one matters more here than elsewhere, since
    // a price answer beginning "-" or "=" is a plausible thing to type.
    //
    // 40, between the 120 I first shipped and the 16 the Conversion agent
    // proposed. 120 invites prose into a field that should hold a figure. 16
    // fails "$25-30 depends on size" at 22 characters, and an over-length
    // answer is a 400 on the WHOLE submission — losing a signup to protect a
    // price note is the wrong trade, and it is the failure this project has
    // spent the week designing against. 40 holds every realistic answer and
    // still has no room for an essay.
    price_band_other: safeString(40).nullish().transform((v) => v || null),

    // SMS. Strict phone format — see phoneSchema for why this one does not
    // fail soft the way `zip` does.
    phone: z.union([phoneSchema, z.literal(''), z.null()]).optional().transform((v) => v || null),
    consent_sms: z.boolean().optional().default(false),
    sms_consent_text_version: consentVersionField(),

    // Postal. A home address is the most identifying thing on this form, so it
    // is stored only behind its own opt-in — see the gating in api/waitlist.js.
    address_line1: safeString(120).nullish().transform((v) => v || null),
    address_line2: safeString(120).nullish().transform((v) => v || null),
    address_city: safeString(80).nullish().transform((v) => v || null),
    address_region: safeString(80).nullish().transform((v) => v || null),
    address_postal_code: z
      .union([postalCodeSchema, z.literal(''), z.null()])
      .optional()
      .transform((v) => v || null),
    address_country: z
      .union([addressCountrySchema, z.literal(''), z.null()])
      .optional()
      .transform((v) => v || null),
    consent_postal: z.boolean().optional().default(false),
    postal_consent_text_version: consentVersionField(),

    // Set by the client ONLY on a downgrade retry, naming the fields it had to
    // strip to get past a stricter server. See the handling in api/waitlist.js:
    // a record written without its extensions must look incomplete in the
    // sheet, not normal.
    downgraded_fields: z
      .union([z.array(safeString(64)).max(64, { message: 'too_many' }), z.null()])
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : v)),

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
  .strict() // Reject unknown keys outright.
  .superRefine((d, ctx) => {
    // An "other" free-text box only means something next to an "other"
    // selection. Text without the selection is a client bug or a probe; the
    // selection is what makes the text interpretable at all. One rule per
    // enum that offers "Other" — all four of them, so adding a fifth enum
    // without its pairing becomes the odd one out rather than the norm.
    const pairs = [
      ['motivation_other', (x) => (x.motivation ?? []).includes('other')],
      ['referral_source_other', (x) => x.referral_source === 'other'],
      ['price_band_other', (x) => x.price_band === 'other'],
      ['dietary_other', (x) => (x.dietary ?? []).includes('other')],
      ['channel_other', (x) => (x.channel ?? []).includes('other')],
    ];
    for (const [field, parentSelectedOther] of pairs) {
      if (d[field] && !parentSelectedOther(d)) {
        ctx.addIssue({ code: 'custom', path: [field], message: 'other_not_selected' });
      }
    }

    // A medication value needs a consent whose WORDING names medication. The
    // general health opt-in does not, so selecting it against the old sentence
    // is rejected rather than quietly stored under a consent that never
    // mentioned it — the failure mode Art 9(2)(a) exists to prevent.
    // ── Role addresses, and the business basis that permits them ──────────
    // Moved out of emailSchema because the verdict depends on a sibling field.
    // Path stays ['email'] with rule `role_address`.
    //
    // NOT for any client's benefit — an earlier version of this comment said
    // "so the client copy written against the old shape keeps working", and
    // that was false. The 400 body is `{ok:false, error:'validation'}` and
    // carries neither path nor rule; no client can read either, deliberately.
    // I made the identical mistake in a message to Conversion two hours before
    // writing it here, which is a good measure of how convincing an assumption
    // about your own neighbouring layer feels.
    //
    // The path is for the AUDIT LOG, which records `path:rule`, and for the
    // suite. Both are real consumers; neither is a browser.
    const localPart = String(d.email || '').split('@')[0];
    const isRole = ROLE_LOCALPARTS.has(localPart);
    const businessText = CONSENT_TEXTS[d.business_consent_text_version]?.text ?? null;
    const businessCovered = consentCoversBusiness(businessText);

    if (d.business_enquiry && !businessCovered) {
      // Declaring the basis is not the same as having shown it. Without the
      // wording there is no consent to point at, and for a shared mailbox
      // there is no individual's consent underneath to fall back on.
      // Name the MISSING elements. A bare `omits_business` on a copy edit sends
      // whoever changed the sentence hunting through a regex; `missing basis,
      // stop_mechanism` tells them what to put back.
      ctx.addIssue({
        code: 'custom',
        path: ['business_consent_text_version'],
        message: `consent_wording_omits_business:${businessConsentGaps(businessText).join('+')}`,
      });
    } else if (isRole && !d.business_enquiry) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'role_address' });
    }

    const wantsMedication = (d.motivation ?? []).some((v) => MEDICATION_MOTIVATIONS.has(v));
    if (wantsMedication) {
      const shown = CONSENT_TEXTS[d.motivation_consent_text_version]?.text ?? null;
      if (!d.consent_health) {
        ctx.addIssue({ code: 'custom', path: ['motivation'], message: 'medication_without_health_consent' });
      } else if (!consentCoversMedication(shown)) {
        ctx.addIssue({ code: 'custom', path: ['motivation_consent_text_version'], message: 'consent_wording_omits_medication' });
      }
    }

    // A consent is a claim about something. Claiming SMS consent with no phone,
    // or postal consent with no address, records an opt-in that can never be
    // acted on and cannot be evidenced against anything.
    if (d.consent_sms && !d.phone) {
      ctx.addIssue({ code: 'custom', path: ['consent_sms'], message: 'sms_consent_without_phone' });
    }
    if (d.consent_postal && !(d.address_line1 && d.address_city && d.address_country)) {
      ctx.addIssue({ code: 'custom', path: ['consent_postal'], message: 'mail_consent_without_address' });
    }
  });

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
