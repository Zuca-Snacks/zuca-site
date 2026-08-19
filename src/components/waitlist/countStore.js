// ─── Live waitlist count ─────────────────────────────────────────────────────
// The number on the page, and the visible +1 when someone joins.
//
// Optimistic, then reconciled. The increment lands the instant the signup
// succeeds — the moment it means something to the person who caused it — and
// the server's real figure replaces it a moment later. If the two disagree the
// server always wins, silently: the point of the animation is to acknowledge
// what the visitor just did, not to assert a number we cannot back.
//
// If the count is never available the whole band falls back to copy — see
// `hero.countFallback`. A missing number must never render as 0 or as a gap.

import { fetchCount } from "./api.js";
import { EVENTS, track } from "../../lib/analytics.js";

const RECONCILE_MS = 2500;

let state = { count: null, pending: 0, bumped: false };
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(getCount());
}

/** `{ value, bumped }` — value is null until the first successful fetch. */
export function getCount() {
  const base = state.count;
  return {
    value: base == null ? null : base + state.pending,
    bumped: state.bumped,
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let loading = false;
/**
 * ⚠️ `/api/count` may answer {"count": null, "error": …} — misconfigured,
 * unavailable, or unconfigured. Null is the honest answer to "how many", and
 * it must render as NOTHING: not 0, not a dash, not a spinner. A counter that
 * might be fiction is worth less than the space it occupies, and "0 signups"
 * actively damages the thing a counter exists to do.
 *
 * Null rather than 0 or -1 is deliberate on the server's side and worth
 * preserving here: it cannot be formatted, summed or compared by accident, so
 * every call site has to decide what absence means instead of letting a
 * sentinel flow through as a number.
 */
export async function loadCount() {
  if (loading) return;
  loading = true;
  const n = await fetchCount();
  loading = false;
  if (typeof n === "number" && n >= 0) {
    state = { ...state, count: n };
    emit();
  }
}

/**
 * Call on a confirmed signup. Shows +1 immediately, then asks the server and
 * snaps to whatever it says.
 *
 * `pending` is kept separate from `count` rather than added into it, so the
 * reconcile is a plain assignment. Folding the optimistic +1 into the base
 * would make a double-reconcile double-count, which is the classic version of
 * this bug.
 */
export function bumpCount() {
  state = { ...state, pending: state.pending + 1, bumped: true };
  emit();
  track(EVENTS.COUNT_INCREMENT, { optimistic: 1 });

  window.setTimeout(async () => {
    const n = await fetchCount();

    if (typeof n === "number" && n >= 0) {
      // Server is authoritative. If it has not caught up with this signup yet,
      // keep the optimistic figure rather than visibly counting back down —
      // but only where we HAD a base to be optimistic about.
      const optimistic = state.count == null ? n : state.count + state.pending;
      state = { count: Math.max(n, optimistic), pending: 0, bumped: state.bumped };
    } else {
      /* ⚠️ NEVER INVENT A BASE. This branch used to read
             (state.count ?? 0) + state.pending
         which, with no count ever loaded, rendered "1 already on the waitlist"
         — a number manufactured out of a failed request and shown as social
         proof. That is the same defect as the server's old hardcoded 136,
         relocated to the client: a failure rendering as data.

         With no authoritative number there is nothing to add to, so the count
         stays absent and the optimistic bump is simply dropped. The visitor
         loses a small flourish; they do not get told a fact we do not have. */
      state = {
        count: state.count == null ? null : state.count + state.pending,
        pending: 0,
        bumped: state.bumped,
      };
    }
    emit();
  }, RECONCILE_MS);
}

/** Clears the one-shot animation flag once it has played. */
export function clearBump() {
  if (!state.bumped) return;
  state = { ...state, bumped: false };
  emit();
}
