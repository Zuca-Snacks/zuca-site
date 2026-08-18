// ─── Waitlist API client ─────────────────────────────────────────────────────
// Codes against the frozen contract in AGENTS_BRIEF.md:
//   POST /api/waitlist  →  200 {ok:true} · 400 validation · 409 duplicate
//                          · 429 rate_limited · 500 server
//
// That endpoint is owned by the security agent and does not exist on this
// branch yet. Until it ships, a 404 or a transport failure falls through to the
// Google Apps Script webhook the live site already uses, with the same payload,
// so no signup is lost in either direction. Delete FALLBACK_URL and the
// postFallback() call once /api/waitlist is deployed — see HANDOFF-growth.md.

import { EVENTS, getUtm, getPagePath, track } from "../../lib/analytics.js";
import { OTHER_MAX } from "./fields.js";

const ENDPOINT = "/api/waitlist";

// The webhook the live site posts to today. `no-cors` means the response is
// opaque — we cannot read a status code from it, so a fallback write is
// optimistically treated as accepted. That is the reason it is a fallback and
// not the primary path.
const FALLBACK_URL =
  "https://script.google.com/macros/s/AKfycbzbC2iN4t6HdqvIj5SqYCuMv6iogDO03BskH4H1cNjGmUCL6rJDKchfYpdcNUqiTHFh/exec";

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
  NETWORK: "network",
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
/**
 * The 16 keys the server's strict schema accepts today. Anything outside this
 * set is an EXTENSION: valid against the fallback webhook, and a 400 against
 * `waitlistSchema` until security widens it. `post()` uses this to downgrade
 * rather than lose a submission — see stripToCore().
 */
export const CORE_KEYS = new Set([
  "email", "zip", "motivation", "intent", "price_band", "flavor", "is_clinician",
  "referral_source", "consent_marketing", "consent_health", "consent_text_version",
  "motivation_consent_text_version", "utm", "page_path", "hp_field", "form_render_ts",
]);

const str = (v, max) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};
const arr = (v, max) => (Array.isArray(v) && v.length ? v.slice(0, max) : null);

export function buildPayload({
  email,
  consentMarketing,
  consentHealth = false,
  consentSms = false,
  consentMail = false,
  consentTextVersion = null,
  motivationConsentTextVersion = null,
  smsConsentTextVersion = null,
  mailConsentTextVersion = null,
  profile = {},
  formRenderTs,
  hpField = "",
}) {
  const health = consentHealth === true;
  const sms = consentSms === true;
  const mail = consentMail === true;
  const p = profile;

  return {
    // ── Core: accepted by the strict schema today ───────────────────────────
    email: String(email || "").trim().toLowerCase().slice(0, 254),
    zip: p.zip || null,
    // Health-adjacent values never travel without their Art 9 opt-in, on our
    // side as well as the server's.
    motivation: health ? arr(p.motivation, 3) : null,
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

    // ── Extensions: pending a schema widening. See HANDOFF-growth.md. ───────
    motivation_other: health ? str(p.motivation_other, OTHER_MAX) : null,
    dietary: health ? arr(p.dietary, 3) : null,
    dietary_other: health ? str(p.dietary_other, OTHER_MAX) : null,
    referral_source_other: str(p.referral_source_other, OTHER_MAX),
    quantity_band: p.quantity_band ?? null,
    channel: arr(p.channel, 2),
    channel_other: str(p.channel_other, OTHER_MAX),
    office_interest: p.office_interest ?? null,
    company_name: str(p.company_name, 80),
    company_headcount: p.company_headcount ?? null,
    research_optin: typeof p.research_optin === "boolean" ? p.research_optin : null,

    // Phone and address are inert without their own opt-in. Sending either
    // while its consent is false would be collecting on a basis we do not have.
    consent_sms: sms,
    phone: sms ? str(p.phone, 24) : null,
    sms_consent_text_version: sms ? smsConsentTextVersion || null : null,

    consent_mail: mail,
    address_line1: mail ? str(p.address_line1, 120) : null,
    address_line2: mail ? str(p.address_line2, 120) : null,
    address_city: mail ? str(p.address_city, 80) : null,
    address_region: mail ? str(p.address_region, 80) : null,
    address_postal: mail ? str(p.address_postal, 16) : null,
    address_country: mail ? str(p.address_country, 56) : null,
    mail_consent_text_version: mail ? mailConsentTextVersion || null : null,
  };
}

/** The same record with every extension removed. Always schema-legal. */
function stripToCore(payload) {
  const core = {};
  for (const [k, v] of Object.entries(payload)) if (CORE_KEYS.has(k)) core[k] = v;
  return core;
}

/** True when the payload carries a non-null value the strict schema rejects. */
function hasExtensions(payload) {
  return Object.entries(payload).some(([k, v]) => !CORE_KEYS.has(k) && v !== null && v !== false);
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
    if (result.status !== RESULT.NETWORK) dequeue(payload);
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

async function postFallback(payload) {
  // Opaque response by design. Success here means "handed to the network".
  await fetch(FALLBACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    mode: "no-cors",
    keepalive: true,
  });
  return { status: RESULT.OK, via: "fallback" };
}

async function post(payload, { downgraded = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive: true,
    });

    // The contract endpoint isn't deployed yet — a static host answers 404 (or
    // 405, or serves index.html). Fall through rather than lose the signup.
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      return await postFallback(payload);
    }

    // A 400 on a payload carrying extensions is the predictable case while the
    // server schema is narrower than the form: it is `.strict()`, so ONE
    // unrecognised key rejects the entire submission. Retry once with the
    // extensions removed rather than lose every answer to a schema lag.
    if (res.status === 400 && hasExtensions(payload)) {
      track(EVENTS.PAYLOAD_DOWNGRADED, {
        dropped: Object.keys(payload).filter((k) => !CORE_KEYS.has(k)).length,
      });
      return await post(stripToCore(payload), { downgraded: true });
    }

    const result = statusToResult(res.status);
    let position = null;
    try {
      const body = await res.json();
      if (body && typeof body.position === "number") position = body.position;
    } catch {
      /* 204, or a body we don't need */
    }
    return { status: result, position, via: downgraded ? "api-core" : "api" };
  } catch {
    // Network error, timeout, CORS rejection, or the route not existing at all.
    try {
      return await postFallback(payload);
    } catch {
      return { status: RESULT.NETWORK, via: "none" };
    }
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
  if (result.status === RESULT.NETWORK) {
    enqueue(payload);
  } else {
    dequeue(payload);
  }
  return result;
}

// ─── Live count ──────────────────────────────────────────────────────────────
// Powers "you're #143" on the confirmation screen and the counter in the hero.
// The contract's 200 response carries no position, so until it does we read the
// list size from the same webhook the live counter already uses. Requested in
// HANDOFF-growth.md.

export async function fetchCount() {
  try {
    const res = await fetch(FALLBACK_URL, { method: "GET" });
    const data = await res.json();
    return typeof data.count === "number" ? data.count : null;
  } catch {
    return null;
  }
}
