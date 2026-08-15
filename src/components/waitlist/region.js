// ─── Client-side region hints ────────────────────────────────────────────────
// `country` is derived server-side from the request IP and is the only
// authoritative answer. This module is not that. It exists because two
// rendering decisions have to be made before any server round trip:
//
//   1. which consent wording to show   → detectConsentRegion()
//   2. whether to show the US ZIP field → detectPostalRegion()
//
// Both read the browser's IANA time zone: no network call, no cookie, no IP
// handling, nothing that needs a consent banner of its own.
//
// The two detectors bias in OPPOSITE directions, on purpose:
//
//   • Consent fails toward strict. Explicit EEA wording is never wrong in the
//     US; the softer US wording shown in the EEA is a violation. Uncertain
//     means EEA.
//   • Postal fails toward showing the field. A hidden field costs one optional
//     data point; a field a non-US visitor cannot fill is friction on the only
//     screen that matters. Uncertain means show it, with the hint.

function getTimeZone() {
  if (typeof Intl === "undefined") return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// ─── Consent ─────────────────────────────────────────────────────────────────

// EEA + UK, plus the non-"Europe/" zones GDPR still reaches (EU outermost
// regions, Iceland, Cyprus). Over-inclusive on purpose.
const EEA_EXTRA_ZONES = new Set([
  "Atlantic/Azores",
  "Atlantic/Canary",
  "Atlantic/Madeira",
  "Atlantic/Reykjavik",
  "Asia/Nicosia",
  "Asia/Famagusta",
  "Indian/Reunion",
  "Indian/Mayotte",
  "America/Cayenne",
  "America/Guadeloupe",
  "America/Martinique",
  "America/Miquelon",
]);

/** 'eea' or 'us'. Anything uncertain resolves to 'eea'. */
export function detectConsentRegion() {
  const zone = getTimeZone();
  if (!zone) return "eea";
  // Europe/* covers the EEA and the UK. It also catches Moscow, Istanbul and
  // Kyiv, which are not EEA — showing them the stricter wording is harmless.
  if (zone.startsWith("Europe/")) return "eea";
  if (EEA_EXTRA_ZONES.has(zone)) return "eea";
  return "us";
}

// ─── Postal ──────────────────────────────────────────────────────────────────

// Every IANA zone in the United States, including the territories that use
// 5-digit ZIP codes (Puerto Rico, US Virgin Islands, Guam, Northern Mariana
// Islands, American Samoa).
const US_ZONES = new Set([
  "America/New_York",
  "America/Detroit",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Vevay",
  "America/Indiana/Tell_City",
  "America/Indiana/Knox",
  "America/Chicago",
  "America/Menominee",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/North_Dakota/Beulah",
  "America/Denver",
  "America/Boise",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Juneau",
  "America/Sitka",
  "America/Metlakatla",
  "America/Yakutat",
  "America/Nome",
  "America/Adak",
  "Pacific/Honolulu",
  // Territories on 5-digit ZIPs.
  "America/Puerto_Rico",
  "America/St_Thomas",
  "Pacific/Guam",
  "Pacific/Saipan",
  "Pacific/Pago_Pago",
  // Deprecated aliases some browsers still report.
  "America/Fort_Wayne",
  "America/Indianapolis",
  "America/Louisville",
  "America/Shiprock",
  "Navajo",
]);

/**
 * 'us' | 'non_us' | 'unknown'.
 *
 * 'unknown' is not a failure mode to design away — it is the case where we show
 * the field *and* the "US only" hint, which is exactly what the hint is for.
 */
export function detectPostalRegion() {
  const zone = getTimeZone();
  if (!zone) return "unknown";
  if (US_ZONES.has(zone) || zone.startsWith("US/")) return "us";
  // A resolved zone that isn't American is a confident negative. A US visitor
  // with an unusual clock loses one optional field; a non-US visitor is spared
  // a question they cannot answer.
  return "non_us";
}
