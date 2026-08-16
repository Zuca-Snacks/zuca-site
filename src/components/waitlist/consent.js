// ─── Consent evidence ────────────────────────────────────────────────────────
// GDPR Art 7(1): no record of what the person was shown means no consent,
// whatever actually happened. This module turns the wording in
// src/content/copy.js into a stable, verifiable identifier that ships with
// every submission as `consent_text_version`.
//
// ── Why the version is derived, not written ─────────────────────────────────
// The identifier is a hash of the exact string the user saw. Edit a word in
// copy.js and the version changes automatically. A hand-maintained version
// number is worse than none: it looks like evidence right up until someone
// edits the text and forgets to bump it, at which point every record it points
// at is quietly wrong.
//
// ── What this module does NOT do ────────────────────────────────────────────
// `consent_timestamp` and `country` are server-set per the contract amendment.
// They are never derived, guessed, or sent from here — a client-supplied
// timestamp is not evidence, and a client-supplied country is not a fact.

import { consentTexts } from "../../content/copy.js";
import { detectConsentRegion } from "./region.js";

// ─── Region → wording ────────────────────────────────────────────────────────
// The region guess lives in region.js. It reads the browser time zone and fails
// toward the strict wording — see that file for why, and for the opposite bias
// used by the postal-code field.
//
// This matters less than it looks, because the identifier records what was
// *actually shown*. If the server's country says EEA and the stored version
// says the US wording, that mismatch is detectable and re-consent is possible —
// the record never lies about what happened, only the guess can be wrong.

// ─── Version derivation ──────────────────────────────────────────────────────

/** FNV-1a, 32-bit. Not a security hash — a stable content fingerprint. */
function fingerprint(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The identifier for one consent wording.
 * Shape: `<purpose>-<region>-<authored>-<fingerprint>`
 * e.g. `mkt-eea-2026-08-15-3f9a21c4`
 *
 * The fingerprint covers everything the user could read, including the privacy
 * link's label and href — a consent that pointed at a different privacy notice
 * is a different consent.
 */
function version(purpose, region, entry) {
  const shown =
    entry.privacyLabel != null
      ? `${entry.text} [${entry.privacyLabel} -> ${entry.privacyHref}]`
      : entry.text;
  return `${purpose}-${region}-${entry.authored}-${fingerprint(shown)}`;
}

/** The marketing consent wording for a region, plus its identifier. */
export function marketingConsent(region = detectConsentRegion()) {
  const key = region === "eea" ? "eea" : "us";
  const entry = consentTexts.marketing[key];
  return {
    region: key,
    text: entry.text,
    privacyLabel: entry.privacyLabel,
    privacyHref: entry.privacyHref,
    version: version("mkt", key, entry),
  };
}

/**
 * The health-motivation opt-in wording plus its identifier.
 *
 * One wording for every region: it is already explicit, specific and separate,
 * which is what GDPR Art 9 requires, and the US has no weaker standard worth
 * having for health-adjacent data.
 */
export function motivationConsent() {
  const entry = consentTexts.motivation;
  return {
    text: entry.text,
    // Audience token is `eea`, not `all`: the server reads the regime off this
    // identifier by token, and `all` parsed as `unknown` — leaving the Art 9
    // consent unauditable by regime on every single record. `eea` is also the
    // honest label: this wording is written to the strict bar and served
    // everywhere, so it can never trigger a false re-consent flag.
    version: version("mot", "eea", entry),
  };
}
