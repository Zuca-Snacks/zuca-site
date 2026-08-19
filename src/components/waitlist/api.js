// ─── Waitlist API client ─────────────────────────────────────────────────────
// Codes against the frozen contract in AGENTS_BRIEF.md:
//   POST /api/waitlist  →  200 {ok:true} · 400 validation · 409 duplicate
//                          · 429 rate_limited · 500 server
//
// ── The Apps Script fallback is GONE (sec/hardening merge, 16 Aug) ───────────
// This module used to hold the Google Apps Script /exec URL and fall back to it
// with `mode: "no-cors"` whenever /api/waitlist answered 404. Both are removed,
// and neither may come back:
//
//   1. The URL in the client bundle IS the vulnerability (SECURITY.md S3). Any
//      copy of it published anywhere makes the write path public, unauthen-
//      ticated and unmetered again. It is now a server-only env var, read by
//      api/waitlist.js, and it must never appear in browser code.
//   2. `no-cors` makes the response opaque, so a failed write is indistinguish-
//      able from a successful one and every submission reports success —
//      silent, unrecoverable loss of real signups (SECURITY.md S7). That is the
//      single behaviour this merge exists to eliminate; do not reintroduce a
//      "safety net" that restores it.
//
// A transport failure is now queued for replay (see enqueue/drainQueue) rather
// than optimistically declared a success. The signup is still not lost — the
// difference is that we now know it hasn't landed yet.

import { EVENTS, getUtm, getPagePath, track } from "../../lib/analytics.js";
import { CHANNEL, DIETARY, MOTIVATION, OTHER_MAX, otherMaxFor } from "./fields.js";

const ENDPOINT = "/api/waitlist";
const COUNT_ENDPOINT = "/api/count";

const TIMEOUT_MS = 10000;
const QUEUE_KEY = "zuca_waitlist_queue_v1";
const QUEUE_MAX = 10;

/** Result codes this module returns. `duplicate` is a success for the UI. */
export const RESULT = {
  OK: "ok",
  DUPLICATE: "duplicate",
  VALIDATION: "validation",
  RATE_LIMITED: "rate_limited",
  SERVER: "server",
  /**
   * The browser is genuinely offline. This is the ONLY state that may tell
   * someone their address is saved, because it is the only one where we
   * actually queued it and know why it has not been delivered.
   */
  OFFLINE: "offline",
};

// ─── Payload ─────────────────────────────────────────────────────────────────

/**
 * Build a contract-shaped body. Only `email` and `consent_marketing` are ever
 * required; every other key is null until step 2 supplies it.
 *
 * ── Consent evidence (contract amendment, 15 Aug 2026) ──────────────────────
 * `consent_text_version` is client-supplied because the client is the only
 * party that knows which wording was rendered.
 *
 * `consent_timestamp` and `country` are **server-set and deliberately absent
 * here.** A client-supplied timestamp is not evidence and a client-supplied
 * country is not a fact — both are trivially forged and neither would survive
 * being relied on. Do not add them to this payload.
 *
 * The health opt-in has its own wording, its own identifier, and its own field:
 * `motivation_consent_text_version`. The legal basis for holding `motivation`
 * at all is that its consent was separate and unbundled, so packing both ids
 * into one string would evidence a single combined act — the exact thing
 * Art 9(2)(a) does not accept. The shape of the record matches the shape of
 * the claim.
 *
 * (The earlier interim that `+`-joined the two ids is gone. It was not just
 * superseded: the server's validator constrains version ids to
 * /^[A-Za-z0-9._-]+$/, so a joined id was a 400 — see HANDOFF-growth.md.)
 *
 * `consent_health` is the affirmative record of the Art 9 opt-in itself. The
 * server drops `motivation` entirely without it, so it is always sent
 * explicitly — including as `false`, because "no" is a fact worth recording.
 */
export const CORE_KEYS = new Set([
  "downgraded_fields",
  "email", "zip", "motivation", "intent", "price_band", "flavor", "is_clinician",
  "referral_source", "consent_marketing", "consent_health", "consent_text_version",
  "motivation_consent_text_version", "utm", "page_path", "hp_field", "form_render_ts",
]);

const str = (v, max) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};
const arr = (v, max) => (Array.isArray(v) && v.length ? v.slice(0, max) : null);
const hasOther = (v) => (Array.isArray(v) ? v.includes("other") : v === "other");

/** E.164 or null. Matches the server's rule exactly rather than approximating it. */
export function toE164(raw) {
  const digits = String(raw || "").trim().replace(/[\s\-().]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** Two uppercase letters or null. */
const iso2 = (v) => {
  const c = String(v || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
};

export function buildPayload({
  email,
  consentMarketing,
  consentHealth = false,
  consentSms = false,
  consentPostal = false,
  consentTextVersion = null,
  motivationConsentTextVersion = null,
  smsConsentTextVersion = null,
  postalConsentTextVersion = null,
  profile = {},
  formRenderTs,
  hpField = "",
}) {
  const health = consentHealth === true;
  const sms = consentSms === true;
  const postal = consentPostal === true;
  const p = profile;

  return {
    // ── Core: accepted by the strict schema today ───────────────────────────
    email: String(email || "").trim().toLowerCase().slice(0, 254),
    zip: p.zip || null,
    // Health-adjacent values never travel without their Art 9 opt-in, on our
    // side as well as the server's.
    motivation: health ? arr(p.motivation, MOTIVATION.options.length) : null,
    intent: p.intent ?? null,
    price_band: p.price_band ?? null,
    flavor: p.flavor ?? null,
    is_clinician: typeof p.is_clinician === "boolean" ? p.is_clinician : null,
    referral_source: p.referral_source ?? null,
    consent_marketing: consentMarketing === true,
    consent_health: health,
    consent_text_version: consentTextVersion || null,
    motivation_consent_text_version: health ? motivationConsentTextVersion || null : null,
    utm: getUtm(),
    page_path: getPagePath(),
    hp_field: hpField || null,
    form_render_ts: typeof formRenderTs === "number" ? formRenderTs : null,

    // ── Extensions ──────────────────────────────────────────────────────────
    // Key names match the server's schema exactly. They are the server's
    // vocabulary where it already had one (`company`, `headcount`,
    // `address_postal_code`, `consent_postal`) and ours where it adopted ours
    // (`quantity_band` values, tri-state `office_interest`, headcount bands).
    //
    // FREE TEXT IS PAIRED WITH ITS SELECTION. The server's superRefine rejects
    // `*_other` text that arrives without the matching "other" choice, and it is
    // right to: text with no selection is uninterpretable. So the pairing is
    // enforced here as well, because state outlives the UI that set it — pick
    // "Other", type, switch to "Friend", and the string is still sitting in
    // state waiting to 400 the whole submission.
    // motivation_other is DELETED, not merely unsent: no free text beside an
    // Art 9 question. The server still accepts the key; we will never populate
    // it. See the note on MOTIVATION in fields.js.
    dietary: health ? arr(p.dietary, DIETARY.options.length) : null,
    dietary_other: health && hasOther(p.dietary) ? str(p.dietary_other, otherMaxFor(DIETARY)) : null,
    referral_source_other:
      p.referral_source === "other" ? str(p.referral_source_other, OTHER_MAX) : null,
    quantity_band: p.quantity_band ?? null,
    channel: arr(p.channel, CHANNEL.options.length),
    channel_other: hasOther(p.channel) ? str(p.channel_other, OTHER_MAX) : null,
    office_interest: p.office_interest ?? null,
    company: str(p.company, 80),
    headcount: p.headcount ?? null,
    research_optin: typeof p.research_optin === "boolean" ? p.research_optin : null,

    // Phone and address are inert without their own opt-in. Sending either
    // while its consent is false would be collecting on a basis we do not have.
    consent_sms: sms,
    // E.164 or nothing. The server requires /^\+[1-9]\d{7,14}$/ and rejects
    // anything else outright, so a number that cannot be normalised is dropped
    // rather than sent to fail — losing a phone number beats losing the record.
    phone: sms ? toE164(p.phone) : null,
    sms_consent_text_version: sms ? smsConsentTextVersion || null : null,

    consent_postal: postal,
    address_line1: postal ? str(p.address_line1, 120) : null,
    address_line2: postal ? str(p.address_line2, 120) : null,
    address_city: postal ? str(p.address_city, 80) : null,
    address_region: postal ? str(p.address_region, 80) : null,
    address_postal_code: postal ? str(p.address_postal_code, 16) : null,
    // ISO 3166-1 alpha-2, from a picker. Free text could never satisfy the
    // server's /^[A-Z]{2}$/ reliably.
    address_country: postal ? iso2(p.address_country) : null,
    postal_consent_text_version: postal ? postalConsentTextVersion || null : null,
  };
}


// ─── Downgrade ladder ────────────────────────────────────────────────────────
// The server schema is `.strict()`: one unrecognised key rejects the WHOLE
// submission. So a 400 is retried against progressively narrower key sets
// rather than straight down to the contract minimum.
//
// Stripping to CORE on the first failure was too blunt — it threw away the
// twelve extension fields the server already accepts because of one field it
// did not. Each rung keeps everything the rung below would have discarded.
//
// SERVER_KNOWN tracks what `waitlistSchema` accepts today. Widen it as security
// converges; when it reaches every key we send, rung 2 becomes a no-op and the
// ladder costs nothing.
export const SERVER_KNOWN_KEYS = new Set([
  ...CORE_KEYS,
  "quantity_band", "office_interest", "company", "headcount",
  // motivation_other is deliberately ABSENT: security removes it at 10a562a,
  // so listing it would make this set wrong in the optimistic direction —
  // claiming the server accepts something it rejects. The ladder cannot
  // recover from that: rung 1 would strip nothing and the retry would 400
  // again. A maintained list can only be trusted when it errs pessimistic.
  "referral_source_other",
  "channel", "channel_other", "dietary", "dietary_other", "research_optin",
  "phone", "consent_sms", "sms_consent_text_version",
  "address_line1", "address_line2", "address_city", "address_region",
  "address_postal_code", "address_country", "consent_postal",
  "postal_consent_text_version",
]);

function stripTo(payload, allowed) {
  const out = {};
  for (const [k, v] of Object.entries(payload)) if (allowed.has(k)) out[k] = v;
  return out;
}

/** Keys carrying a real value that `allowed` would drop. */
function droppedBy(payload, allowed) {
  return Object.keys(payload).filter(
    (k) => !allowed.has(k) && payload[k] !== null && payload[k] !== false
  );
}

// ─── Offline queue ───────────────────────────────────────────────────────────
// A transport failure must never lose an email. Failed payloads are parked in
// localStorage and replayed on the next mount and on the next `online` event.

function readQueue() {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-QUEUE_MAX)));
  } catch {
    /* private mode — the in-flight retry is all we have */
  }
}

function enqueue(payload) {
  const queue = readQueue().filter((item) => item.email !== payload.email);
  queue.push(payload);
  writeQueue(queue);
}

function dequeue(payload) {
  writeQueue(readQueue().filter((item) => item.email !== payload.email));
}

/** Replay anything stranded by a previous failure. Safe to call repeatedly. */
export async function drainQueue() {
  const queue = readQueue();
  if (!queue.length) return;
  for (const payload of queue) {
    const result = await post(payload);
    if (result.status !== RESULT.OFFLINE) dequeue(payload);
  }
}

// ─── Transport ───────────────────────────────────────────────────────────────

function statusToResult(status) {
  if (status === 200 || status === 201 || status === 204) return RESULT.OK;
  if (status === 409) return RESULT.DUPLICATE;
  if (status === 400 || status === 422) return RESULT.VALIDATION;
  if (status === 429) return RESULT.RATE_LIMITED;
  return RESULT.SERVER;
}

async function post(payload, rung = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      // Required — the endpoint answers 415 without it.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive: true,
    });

    // Every status is now read and acted on. A 404/405 here means our own
    // endpoint is missing or misrouted, which is a deploy fault worth surfacing
    // as an error — not something to paper over with a second write path.
    // Climb down the ladder on a validation failure, one rung at a time.
    if (res.status === 400 && rung < 2) {
      const allowed = rung === 0 ? SERVER_KNOWN_KEYS : CORE_KEYS;
      const dropped = droppedBy(payload, allowed);
      if (dropped.length) {
        track(EVENTS.PAYLOAD_DOWNGRADED, { rung: rung + 1, dropped: dropped.length });
        // Name what we stripped. The server writes this alongside the record so
        // a downgraded row LOOKS incomplete in the sheet rather than looking
        // like someone who simply declined to answer — the two are impossible
        // to tell apart afterwards without it, and only one of them is our bug.
        const next = stripTo(payload, allowed);
        next.downgraded_fields = [...new Set([...(payload.downgraded_fields || []), ...dropped])].slice(0, 64);
        return await post(next, rung + 1);
      }
    }

    const result = statusToResult(res.status);
    let position = null;
    try {
      const body = await res.json();
      if (body && typeof body.position === "number") position = body.position;
    } catch {
      /* 204, or a body we don't need */
    }
    return { status: result, position, via: rung === 0 ? "api" : `api-rung${rung}` };
  } catch {
    /* A fetch that throws is TWO different failures wearing one coat, and they
       need opposite messages:

         browser offline        → their network. We queue it and replay, so
                                  "saved, we'll send it when you're back" is true.
         everything else        → DNS, CORS, a timeout, a missing env var in
                                  production, an endpoint that does not exist.
                                  Our fault, nothing queued, nothing saved.

       Treating both as "you look offline" told someone with perfect
       connectivity that we had kept their email while it went nowhere — a
       reassuring message is worse than a blunt one when it is false, because
       they stop trying. */
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return { status: offline ? RESULT.OFFLINE : RESULT.SERVER, via: "none" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit a waitlist payload.
 * Returns `{status, position?, via}`. A NETWORK result has been queued for
 * replay — the email is not lost, it is just not delivered yet.
 */
export async function submitWaitlist(payload) {
  const result = await post(payload);
  // Only a genuine offline state is queued. A 404 or a 500 is not something a
  // retry-on-reconnect fixes, and queueing it would make the UI's "we have it"
  // language true-ish in a way that hides a broken deploy.
  if (result.status === RESULT.OFFLINE) {
    enqueue(payload);
  } else {
    dequeue(payload);
  }
  return result;
}

// ─── Live count ──────────────────────────────────────────────────────────────
// Powers "you're #143" on the confirmation screen and the counter in the hero,
// the proof strip and the sticky bar.
//
// Reads our own /api/count, not the Apps Script. The browser has no way to
// reach the webhook any more, which is the point: the count route re-emits only
// the `count` field, so a change upstream cannot start leaking rows through it.

export async function fetchCount() {
  try {
    const res = await fetch(COUNT_ENDPOINT, { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.count === "number" ? data.count : null;
  } catch {
    return null;
  }
}
