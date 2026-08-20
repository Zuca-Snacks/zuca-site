// ─── Dial codes, and why this file is cautious ───────────────────────────────
// The server requires strict E.164 (/^\+[1-9]\d{7,14}$/) and keeps doing so.
// This file's job is to ASSEMBLE a number from a country the person STATED,
// never to infer one.
//
// ⚠️ THE FAILURE THIS FILE EXISTS TO PREVENT IS NOT A REJECTED NUMBER.
// Invalid input is safe: it is refused and the person fixes it. The dangerous
// outcome is a number that is valid E.164 and belongs to someone else, stored
// against an SMS consent we would be legally permitted to act on. Two ways to
// produce one:
//
//   1. guessing the dial code        — never done here; it is always selected
//   2. mishandling a trunk prefix    — "+47" + "0912 34 567"
//
// (2) is the subtle one. A leading 0 is a NATIONAL trunk prefix in the UK,
// Germany, Sweden and others, and must be dropped when internationalising.
// In Norway and Denmark it is NOT a prefix — Norwegian numbers are eight
// digits with no leading zero — so stripping it there would silently invent a
// different subscriber. Getting this wrong in EITHER direction yields a
// plausible number, which is why length is checked as well as shape.
//
// Lengths are national-significant-number lengths, deliberately generous where
// a country's plan is genuinely variable. A too-strict range rejects a real
// customer; a too-loose one only lets a malformed number reach the server's
// own E.164 check. Erring loose is the safe direction here — the opposite of
// the trunk rule, where erring either way is unsafe.
export const DIAL_CODES = [
  { code: "US", name: "United States", dial: "1", trunk: null, min: 10, max: 10 },
  { code: "CA", name: "Canada", dial: "1", trunk: null, min: 10, max: 10 },
  { code: "GB", name: "United Kingdom", dial: "44", trunk: "0", min: 9, max: 10 },
  { code: "NO", name: "Norway", dial: "47", trunk: null, min: 8, max: 8 },
  { code: "SE", name: "Sweden", dial: "46", trunk: "0", min: 7, max: 9 },
  { code: "DK", name: "Denmark", dial: "45", trunk: null, min: 8, max: 8 },
  { code: "FI", name: "Finland", dial: "358", trunk: "0", min: 6, max: 10 },
  { code: "DE", name: "Germany", dial: "49", trunk: "0", min: 9, max: 11 },
  { code: "NL", name: "Netherlands", dial: "31", trunk: "0", min: 9, max: 9 },
  { code: "BE", name: "Belgium", dial: "32", trunk: "0", min: 8, max: 9 },
  { code: "FR", name: "France", dial: "33", trunk: "0", min: 9, max: 9 },
  { code: "ES", name: "Spain", dial: "34", trunk: null, min: 9, max: 9 },
  { code: "PT", name: "Portugal", dial: "351", trunk: null, min: 9, max: 9 },
  { code: "IT", name: "Italy", dial: "39", trunk: null, min: 9, max: 10, zeroOk: true },
  { code: "CH", name: "Switzerland", dial: "41", trunk: "0", min: 9, max: 9 },
  { code: "AT", name: "Austria", dial: "43", trunk: "0", min: 8, max: 11 },
  { code: "IE", name: "Ireland", dial: "353", trunk: "0", min: 7, max: 9 },
  { code: "PL", name: "Poland", dial: "48", trunk: null, min: 9, max: 9 },
  { code: "AU", name: "Australia", dial: "61", trunk: "0", min: 9, max: 9 },
  { code: "NZ", name: "New Zealand", dial: "64", trunk: "0", min: 8, max: 10 },
];

const BY_CODE = new Map(DIAL_CODES.map((c) => [c.code, c]));

/**
 * A default the person can SEE and change. Never a silent one.
 *
 * The IP-derived country is server-side only and is never returned to the
 * client, so this uses the browser time zone — the same signal the consent
 * wording already uses. It is a hint for the initial selection, nothing more:
 * whatever it picks is rendered as a selected option, so a wrong guess costs
 * one tap rather than producing a stranger's number.
 */
const ZONE_COUNTRY = {
  "Europe/Oslo": "NO", "Europe/Stockholm": "SE", "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI", "Europe/London": "GB", "Europe/Dublin": "IE",
  "Europe/Berlin": "DE", "Europe/Amsterdam": "NL", "Europe/Brussels": "BE",
  "Europe/Paris": "FR", "Europe/Madrid": "ES", "Europe/Lisbon": "PT",
  "Europe/Rome": "IT", "Europe/Zurich": "CH", "Europe/Vienna": "AT",
  "Europe/Warsaw": "PL", "Australia/Sydney": "AU", "Pacific/Auckland": "NZ",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "America/Winnipeg": "CA", "America/Halifax": "CA",
};

export function defaultDialCountry() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ZONE_COUNTRY[zone] || "US";
  } catch {
    return "US";
  }
}

/**
 * Assemble E.164 from a stated country and whatever the person typed.
 * Returns { e164 } or { error } — never a best guess.
 */
export function assemblePhone(countryCode, raw) {
  const c = BY_CODE.get(countryCode);
  if (!c) return { error: "Pick a country code." };

  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return { error: null, e164: null };

  // Someone who typed the full international form, with or without the +.
  if (digits.startsWith(c.dial) && digits.length > c.max) digits = digits.slice(c.dial.length);

  // The trunk prefix, dropped ONLY where the country actually has one.
  if (c.trunk && digits.startsWith(c.trunk)) digits = digits.slice(c.trunk.length);

  // ⚠️ AND WHERE A COUNTRY HAS NO TRUNK PREFIX, A LEADING ZERO IS NOT ONE.
  // Found by running the cases rather than reasoning about them: Denmark has
  // no trunk prefix and an 8-digit plan, so "0912 34 56" passed the length
  // check and assembled to +4509123456 — valid E.164, and not a Danish number.
  // The same shape as the Norwegian case, one country over.
  // Italy is the exception the blanket rule would break: its leading 0 is part
  // of the subscriber number, not a prefix.
  if (!c.trunk && !c.zeroOk && digits.startsWith("0")) {
    return { error: `A ${c.name} number doesn't start with 0 — drop it.` };
  }

  if (digits.length < c.min || digits.length > c.max) {
    const expect = c.min === c.max ? `${c.min} digits` : `${c.min}–${c.max} digits`;
    return { error: `A ${c.name} number is ${expect} after +${c.dial}.` };
  }

  const e164 = `+${c.dial}${digits}`;
  // The server's own rule, applied here so a bad assembly cannot reach it.
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return { error: "That doesn't look like a phone number." };
  return { error: null, e164 };
}
