// ─── Zuca funnel analytics ───────────────────────────────────────────────────
// Zero-dependency, cookieless event dispatcher. Nothing is installed and no
// cookie is written, so the site needs no cookie banner.
//
// The dispatcher forwards to whatever is present on `window` at call time:
//   • window.plausible(name, {props})   — Plausible / Fathom-style, cookieless
//   • window.dataLayer.push({event})    — GTM / GA4
//   • window.gtag('event', ...)         — GA4 direct
// If none are present, events buffer (capped) and flush automatically the
// moment a tool appears. Adding a real analytics tool later is a script tag —
// no code change here.
//
// ── PII RULES — enforced in code below, not by convention ────────────────────
//  1. An email address NEVER leaves this file's boundary. `email` is stripped
//     from every payload before dispatch.
//  2. `motivation` values are health-adjacent personal data. Only the COUNT is
//     ever emitted. The values themselves are never sent to any third party.
//  3. Only counts and contract enum values are dispatched.

const BUFFER_MAX = 60;
const UTM_KEYS = ["source", "medium", "campaign", "content", "term"];
const UTM_STORAGE_KEY = "zuca_utm_v1";
const UTM_MAX_LEN = 64;

// Keys that must never reach a third party, at any nesting depth.
const FORBIDDEN_KEYS = new Set(["email", "motivation", "zip", "hp_field"]);

const buffer = [];
let flushScheduled = false;

const isBrowser = typeof window !== "undefined";
const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

// ─── UTM capture ─────────────────────────────────────────────────────────────
// Captured once on first load and persisted for the session, so a submit that
// happens after client-side navigation still carries the campaign attribution.

function truncate(v) {
  return String(v).slice(0, UTM_MAX_LEN);
}

function readUtmFromUrl() {
  if (!isBrowser) return null;
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  for (const key of UTM_KEYS) {
    const raw = params.get(`utm_${key}`);
    if (raw) utm[key] = truncate(raw);
  }
  return Object.keys(utm).length ? utm : null;
}

function readUtmFromStorage() {
  if (!isBrowser) return null;
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Capture UTMs from the URL into session storage. Idempotent; first hit wins. */
export function captureUtm() {
  if (!isBrowser) return null;
  const fromUrl = readUtmFromUrl();
  if (fromUrl) {
    try {
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(fromUrl));
    } catch {
      /* private mode — fall through, URL is still readable this pageview */
    }
    return fromUrl;
  }
  return readUtmFromStorage();
}

/** The `utm` object for the waitlist contract. Null when there is no campaign. */
export function getUtm() {
  return readUtmFromStorage() || readUtmFromUrl();
}

/** True when this visitor arrived from a tagged campaign (i.e. the cold email). */
export function isCampaignTraffic() {
  return getUtm() !== null;
}

export function getPagePath() {
  if (!isBrowser) return null;
  return window.location.pathname.slice(0, 200);
}

// ─── Payload scrubbing ───────────────────────────────────────────────────────

function scrub(props) {
  if (!props || typeof props !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    // Arrays of enums are allowed; arrays of anything else are reduced to a count.
    if (Array.isArray(value)) {
      out[key] = value.length;
      continue;
    }
    if (typeof value === "object") continue;
    out[key] = value;
  }
  return out;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function sinks() {
  if (!isBrowser) return [];
  const found = [];
  if (typeof window.plausible === "function") {
    found.push((name, props) => window.plausible(name, { props }));
  }
  if (Array.isArray(window.dataLayer)) {
    found.push((name, props) => window.dataLayer.push({ event: name, ...props }));
  }
  if (typeof window.gtag === "function") {
    found.push((name, props) => window.gtag("event", name, props));
  }
  return found;
}

function deliver(name, props) {
  const active = sinks();
  if (!active.length) return false;
  for (const send of active) {
    try {
      send(name, props);
    } catch {
      /* a broken analytics tool must never break the form */
    }
  }
  return true;
}

function flush() {
  flushScheduled = false;
  if (!sinks().length) return;
  while (buffer.length) {
    const { name, props } = buffer.shift();
    deliver(name, props);
  }
}

function scheduleFlush() {
  if (flushScheduled || !isBrowser) return;
  flushScheduled = true;
  // Idle-time retry: picks up a tool that loads after the form mounts.
  const run = () => flush();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 2000);
  }
}

/**
 * Emit a funnel event. Never throws, never blocks, never carries PII.
 * @param {string} name  one of EVENTS
 * @param {object} [props] counts and enum values only
 */
export function track(name, props) {
  if (!isBrowser) return;
  const utm = getUtm();
  const payload = {
    ...scrub(props),
    ...(utm ? { utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign } : {}),
  };

  if (isDev) {
    console.debug("[zuca:analytics]", name, payload);
  }

  // Always emit a DOM event — lets anything (a tag manager, a test, a future
  // tool) subscribe without this module knowing about it.
  try {
    window.dispatchEvent(new CustomEvent("zuca:analytics", { detail: { name, props: payload } }));
  } catch {
    /* no-op */
  }

  if (!deliver(name, payload)) {
    if (buffer.length >= BUFFER_MAX) buffer.shift();
    buffer.push({ name, props: payload });
    scheduleFlush();
  }
}

const firedOnce = new Set();

/**
 * Emit a funnel-stage event at most once per pageview. The form is mounted
 * twice (hero and footer), so a per-mount event would double every stage and
 * make the drop-off between stages meaningless.
 */
export function trackOnce(name, props) {
  if (firedOnce.has(name)) return;
  firedOnce.add(name);
  track(name, props);
}

// ─── The funnel ──────────────────────────────────────────────────────────────
// Ordered. Each step's drop-off is the number that tells us what to fix.
export const EVENTS = {
  PAGE_VIEW: "page_view",
  HERO_CTA_VIEW: "hero_cta_view",
  EMAIL_FIELD_FOCUS: "email_field_focus",
  STEP1_SUBMIT: "step1_submit",
  STEP1_SUCCESS: "step1_success",
  STEP1_ERROR: "step1_error",
  STEP2_VIEW: "step2_view",
  STEP2_FIELD: "step2_field",
  STEP2_SUBMIT: "step2_submit",
  STEP2_SKIP: "step2_skip",
  SHARE_CLICK: "share_click",
  // Supporting event, outside the core funnel.
  FAQ_OPEN: "faq_open",
};

/** Fire once per pageview. Captures UTMs as a side effect. */
export function trackPageView() {
  captureUtm();
  track(EVENTS.PAGE_VIEW, { path: getPagePath(), campaign: isCampaignTraffic() ? 1 : 0 });
}

/**
 * Fire when an element first becomes visible. Returns a cleanup function.
 * Used for hero_cta_view and step2_view so we can measure "saw it" vs "used it".
 */
export function observeOnce(el, name, props) {
  if (!isBrowser || !el || typeof IntersectionObserver === "undefined") return () => {};
  let fired = false;
  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !fired) {
          fired = true;
          track(name, props);
          obs.disconnect();
        }
      }
    },
    { threshold: 0.5 }
  );
  obs.observe(el);
  return () => obs.disconnect();
}
