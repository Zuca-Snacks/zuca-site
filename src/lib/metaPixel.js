// ─── Meta Pixel ──────────────────────────────────────────────────────────────
// Additive. It does not touch src/lib/analytics.js and Plausible is unaffected.
//
// ⚠️ ENTIRELY KEYED OFF import.meta.env.VITE_META_PIXEL_ID.
// With the variable absent every export is a clean no-op: no script tag, no
// `fbq` on window, no console output, no request to connect.facebook.net. That
// is the default in Node (where `import.meta.env` does not exist at all), in
// any build that does not set it, and in every test in this suite.
//
// The ID is a public identifier, not a secret — it ships in the page of every
// site that uses one. It is read from the environment anyway so that builds
// without it are provably inert, which is a different property from hiding it.

// ⚠️ DIRECT MEMBER ACCESS, NOT `import.meta.env?.VITE_…`, AND THAT MATTERS.
// Vite substitutes `import.meta.env.VITE_X` textually at build time. Optional
// chaining defeats the substitution, so the value stays a runtime lookup, the
// constant is unknown to the bundler, and the whole loader survives into the
// bundle as unreachable code. Measured: with the variable unset, the optional
// -chained version left `connect.facebook.net` in the output; this one does
// not. Both are inert at runtime — the difference is whether the dead branch
// ships at all.
//
// The `typeof` guard is for Node, where `import.meta.env` does not exist and a
// bare member access would throw at import time.
const PIXEL_ID =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_META_PIXEL_ID) ||
  null;

/** True only when a pixel is configured. Every other export checks this. */
export function isPixelEnabled() {
  return Boolean(PIXEL_ID);
}

let initialised = false;

/**
 * Inject fbevents.js, init, and fire one PageView.
 *
 * ⚠️ IDEMPOTENT ON PURPOSE. React strict mode double-invokes effects in
 * development, and a second `fbq('init')` would register the pixel twice and
 * double every subsequent event. The module-level flag is the guard; the
 * `window.fbq` check is a second one for a script that arrived by other means.
 */
export function initMetaPixel() {
  if (!PIXEL_ID || initialised || typeof window === "undefined") return;
  initialised = true;

  // Vendor loader, verbatim from Meta. Left unedited for the same reason the
  // Plausible stub is: an edited copy of a vendor snippet drifts from theirs.
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

/**
 * One id per submission, shared by the browser event and the server event.
 *
 * ⚠️ THIS SINGLE STRING IS THE ENTIRE DEDUPLICATION MECHANISM. The browser
 * sends `Lead` with `eventID`, the server sends its own event with `event_id`,
 * and Meta collapses them only if the two are byte-identical. Diverge and every
 * signup is counted twice — silently, because both events are individually
 * valid and nothing errors.
 */
export function newEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Older Safari and any non-secure context. RFC 4122 v4 from real entropy
  // where it exists; the shape matters less than the uniqueness, but keeping
  // the shape means a malformed id is visible in Meta's UI rather than merely
  // unmatched.
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

/** Fire Lead with the shared id. No-op when no pixel is configured. */
export function trackLead(eventId) {
  if (!PIXEL_ID || typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", "Lead", {}, { eventID: eventId });
}

/**
 * `_fbp` and `_fbc`, for the server to forward.
 *
 * Keys are OMITTED when the cookie is absent rather than sent empty: the
 * waitlist schema is `.strict()` and rejects on key presence, and an empty
 * string is a value that would have to be handled everywhere downstream. `_fbc`
 * is the one carrying an ad click through to attribution, so it is the field
 * the paid test actually depends on.
 */
export function getFbCookies() {
  if (typeof document === "undefined" || !document.cookie) return {};
  const out = {};
  for (const part of document.cookie.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!value) continue;
    if (name === "_fbp") out.fbp = value;
    else if (name === "_fbc") out.fbc = value;
  }
  return out;
}
