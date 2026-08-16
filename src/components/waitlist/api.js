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

import { getUtm, getPagePath } from "../../lib/analytics.js";

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
export function buildPayload({
  email,
  consentMarketing,
  consentHealth = false,
  consentTextVersion = null,
  motivationConsentTextVersion = null,
  profile = {},
  formRenderTs,
  hpField = "",
}) {
  const healthGranted = consentHealth === true;

  return {
    email: String(email || "").trim().toLowerCase().slice(0, 254),
    zip: profile.zip || null,
    motivation:
      healthGranted && profile.motivation && profile.motivation.length
        ? profile.motivation.slice(0, 3)
        : null,
    intent: profile.intent ?? null,
    price_band: profile.price_band ?? null,
    flavor: profile.flavor ?? null,
    is_clinician: typeof profile.is_clinician === "boolean" ? profile.is_clinician : null,
    referral_source: profile.referral_source ?? null,
    consent_marketing: consentMarketing === true,
    consent_health: healthGranted,
    consent_text_version: consentTextVersion || null,
    motivation_consent_text_version: healthGranted ? motivationConsentTextVersion || null : null,
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

async function post(payload) {
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
    // Network error, timeout, or abort. Queued for replay by submitWaitlist.
    return { status: RESULT.NETWORK, via: "none" };
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
