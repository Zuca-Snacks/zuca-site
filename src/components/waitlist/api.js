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

import { getUtm, getPagePath } from "../../lib/analytics.js";

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
 * When the user also accepts the health-motivation opt-in, they have agreed to
 * two separate texts. The contract has one field, so both identifiers travel in
 * it, `+`-joined and stably ordered (marketing first). Splitting on `+` yields
 * the individual versions. See HANDOFF-growth.md — a dedicated field is the
 * better long-term shape.
 */
export function buildPayload({
  email,
  consentMarketing,
  consentTextVersion = null,
  motivationConsentTextVersion = null,
  profile = {},
  formRenderTs,
  hpField = "",
}) {
  const consentVersions = [consentTextVersion, motivationConsentTextVersion].filter(Boolean);

  return {
    email: String(email || "").trim().toLowerCase().slice(0, 254),
    zip: profile.zip || null,
    motivation: profile.motivation && profile.motivation.length ? profile.motivation.slice(0, 3) : null,
    intent: profile.intent ?? null,
    price_band: profile.price_band ?? null,
    flavor: profile.flavor ?? null,
    is_clinician: typeof profile.is_clinician === "boolean" ? profile.is_clinician : null,
    referral_source: profile.referral_source ?? null,
    consent_marketing: consentMarketing === true,
    consent_text_version: consentVersions.length ? consentVersions.join("+") : null,
    // consent_timestamp — server-set. Never sent from here.
    // country          — server-derived from request IP. Never sent, never asked.
    utm: getUtm(),
    page_path: getPagePath(),
    hp_field: hpField || null,
    form_render_ts: typeof formRenderTs === "number" ? formRenderTs : null,
  };
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

async function post(payload) {
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

    const result = statusToResult(res.status);
    let position = null;
    try {
      const body = await res.json();
      if (body && typeof body.position === "number") position = body.position;
    } catch {
      /* 204, or a body we don't need */
    }
    return { status: result, position, via: "api" };
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
