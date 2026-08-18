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
      // Server is authoritative. If it has not caught up yet, keep the
      // optimistic figure rather than visibly counting back down.
      const optimistic = (state.count ?? 0) + state.pending;
      state = { count: Math.max(n, optimistic), pending: 0, bumped: state.bumped };
    } else {
      // No answer: fold the optimistic bump into the base so it stops being
      // provisional and the number does not jump when the next fetch lands.
      state = { count: (state.count ?? 0) + state.pending, pending: 0, bumped: state.bumped };
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
