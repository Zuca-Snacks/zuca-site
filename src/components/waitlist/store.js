// ─── Shared waitlist state ───────────────────────────────────────────────────
// The form is mounted twice (hero and footer). Signing up in one must
// immediately settle the other, or a user scrolls down and is asked for the
// email they just gave. A module-level store keeps both instances in step, and
// sessionStorage keeps the confirmation across a reload.

const KEY = "zuca_waitlist_state_v1";

/** stage: 'email' → 'profile' → 'done' */
const EMPTY = { stage: "email", email: "", name: "", position: null, duplicate: false, profileSaved: false };

function load() {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { ...EMPTY, ...parsed } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

let state = load();
const listeners = new Set();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode — in-memory state still works for this pageview */
  }
}

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  persist();
  for (const fn of listeners) fn(state);
}

/** Roll back an optimistic transition. */
export function resetToEmail() {
  setState({ stage: "email", position: null, duplicate: false });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
