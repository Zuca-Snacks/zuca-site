// ─── Background saves, strictly serialised ───────────────────────────────────
// A step-2 advance used to block on a POST that ends at Apps Script. Measured
// against production: a warm write is 4.9-7.1s, and the same function reading
// through Apps Script is 2.1-2.6s, against ~70-110ms for an edge-cached read.
// So the wait is the Apps Script round trip, and every "Next" paid it.
//
// This makes the save fire-and-forget so the screen advances immediately.
//
// ⚠️ THE DANGER IS NOT A LOST SAVE, IT IS A REVERTED ONE.
// Every payload carries the FULL accumulated profile and the sheet is
// last-write-wins. Two saves racing therefore cannot merely miss an update —
// a slow earlier save landing after a faster later one REVERTS the later one.
// Someone presses Back, corrects an answer, and the correction is silently
// undone. Worse for consent: withdrawal is permitted (Art 7(3) true -> false),
// so a stale save landing late can resurrect a consent that was deliberately
// withdrawn. Losing data leaves a blank cell, which looks incomplete. This
// would leave a confidently wrong cell, which looks fine.
//
// The fix is single-flight coalescing rather than sequence numbers, which would
// need a server change:
//
//   • at most ONE request in flight, ever
//   • a save arriving while one is in flight becomes `pending`
//   • a newer save REPLACES pending — it is a superset, so the older one has
//     nothing the newer lacks
//   • when the flight settles, pending goes next
//
// Requests are therefore totally ordered by construction and the last write is
// always the newest state. Out-of-order arrival is not handled, it is unable to
// occur.

import { RESULT, submitWaitlist } from "./api.js";

let inFlight = null; // Promise for the request currently on the wire
let pending = null; // { payload } — at most one, always the newest
let failure = null; // the last permanent failure, surfaced before confirmation

/** Statuses that mean "stop trying" rather than "not yet". */
function isPermanentFailure(status) {
  // OFFLINE is already persisted to localStorage and replayed by drainQueue,
  // so it is not a failure the person needs to see or act on.
  // IN_FLIGHT is deliberately NOT excused here, unlike DUPLICATE and OFFLINE.
  // On step 2 every save carries an edit token, so the server takes the update
  // path and never claims a key — and single-flight coalescing means we never
  // race ourselves. So an in_flight here is genuinely unexpected, and the
  // truthful "we couldn't save these answers, try again?" is better than
  // treating an unexplained state as success. That mistake was S23.
  return status !== RESULT.OK && status !== RESULT.DUPLICATE && status !== RESULT.OFFLINE;
}

async function run(payload) {
  const result = await submitWaitlist(payload);
  if (isPermanentFailure(result.status)) failure = result.status;
  else failure = null;
  return result;
}

async function pump() {
  while (pending) {
    const next = pending;
    pending = null;
    inFlight = run(next.payload);
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  }
}

/**
 * Queue a save and return immediately. The caller advances the UI.
 * Returns nothing deliberately: an awaitable here invites re-blocking.
 */
export function queueSave(payload) {
  pending = { payload };
  if (!inFlight) pump();
}

/**
 * Wait for everything queued to finish, and report whether it landed.
 *
 * Called before the confirmation screen. This is the ONLY place the person
 * waits, and it is the price of not telling them their answers are saved when
 * they are not — S23 was exactly that lie, and doing it deliberately would be
 * worse than doing it by accident.
 */
export async function settleSaves() {
  while (inFlight || pending) {
    if (inFlight) await inFlight.catch(() => {});
    if (pending && !inFlight) await pump();
  }
  return { ok: failure === null, status: failure };
}

/** Test seam and remount hygiene. */
export function resetSaveQueue() {
  inFlight = null;
  pending = null;
  failure = null;
}
