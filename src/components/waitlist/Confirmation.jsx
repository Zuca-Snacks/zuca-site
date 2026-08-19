// ─── Confirmation ────────────────────────────────────────────────────────────
// The highest-attention moment on the site. It gets a real position number,
// a dated expectation, and one thing to do next.

import { useEffect, useState } from "react";
import Button from "../ui/Button.jsx";
import { confirmation as copy } from "../../content/copy.js";
import { fetchCount } from "./api.js";
import { EVENTS, track } from "../../lib/analytics.js";

/** 1st, 2nd, 3rd, 4th… including the 11–13 exceptions. */
function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}

function shareUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin + window.location.pathname);
  // Tag the referral so a shared link is attributable, and so it doesn't get
  // credited to the outbound email campaign.
  url.searchParams.set("utm_source", "referral");
  url.searchParams.set("utm_medium", "share");
  return url.toString();
}

// `profileSaved` is no longer read: the line it drove ("those answers go
// straight into what we make first") was removed. The prop stays in
// WaitlistForm's call so the distinction survives if the screen ever wants it
// again — it is the difference between someone who answered and someone who
// skipped, which is worth not throwing away at the call site.
export default function Confirmation({ position: knownPosition, duplicate }) {
  const [position, setPosition] = useState(knownPosition ?? null);
  const [shared, setShared] = useState(false);
  // "copy" once the native sheet is unavailable; "failed" if even that breaks.
  const [fallback, setFallback] = useState("");

  useEffect(() => {
    if (position !== null) return undefined;
    let alive = true;
    // The contract's 200 carries no position yet (see HANDOFF-growth.md), so the
    // list size stands in. If it can't be read, the headline falls back to a
    // version that doesn't need a number.
    fetchCount().then((count) => {
      if (alive && typeof count === "number") setPosition(count);
    });
    return () => {
      alive = false;
    };
  }, [position]);

  /**
   * Share, and never appear dead.
   *
   * THREE FAILURES, FOUND IN ORDER, ALL LOOKING IDENTICAL FROM THE OUTSIDE:
   *   1. `return` after navigator.share, so a sheet that THREW was swallowed.
   *   2. Every branch caught silently, so a clipboard denial did nothing.
   *   3. And the one that actually kept biting: navigator.share EXISTS in
   *      browsers where it never settles. `await` on a promise that neither
   *      resolves nor rejects hangs forever — no fallback, no feedback, no
   *      analytics event, button unchanged. Feature detection was the bug:
   *      the API being present is not the API working.
   *
   * So: the attempt is recorded BEFORE the await (a click we cannot explain is
   * still a click we should see), the native path is raced against a timeout so
   * a hang falls through instead of stopping, and every route ends in something
   * the eye can see.
   */
  const NATIVE_TIMEOUT_MS = 1500;

  async function handleShare() {
    const url = shareUrl();
    // Recorded first. If everything below fails, we still know it was pressed.
    track(EVENTS.SHARE_CLICK, { method: "attempt" });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const settled = await Promise.race([
          navigator.share({ title: "Zuca", text: copy.shareText, url }).then(() => "shared"),
          new Promise((r) => window.setTimeout(() => r("timeout"), NATIVE_TIMEOUT_MS)),
        ]);
        if (settled === "shared") {
          track(EVENTS.SHARE_CLICK, { method: "native", ok: 1 });
          return;
        }
        // Timed out: the sheet never came. Fall through rather than wait.
      } catch (err) {
        // Dismissing the sheet is a completed interaction, not a failure.
        if (err && err.name === "AbortError") {
          track(EVENTS.SHARE_CLICK, { method: "native", ok: 0 });
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      track(EVENTS.SHARE_CLICK, { method: "copy", ok: 1 });
      setShared(true);
      window.setTimeout(() => setShared(false), 3000);
      return;
    } catch {
      /* No permission, or an insecure context. One route left. */
    }

    // No native sheet and no silent copy. Offer an explicit Copy button rather
    // than printing the URL — a raw link on screen is ugly, helps nobody, and
    // asks the person to select it by hand on the device least able to.
    track(EVENTS.SHARE_CLICK, { method: "fallback_offered", ok: 1 });
    setFallback("copy");
  }

  /** The explicit second press, once the native sheet has proved unavailable. */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      track(EVENTS.SHARE_CLICK, { method: "copy_button", ok: 1 });
      setShared(true);
      window.setTimeout(() => setShared(false), 3000);
    } catch {
      // Still never a printed URL. Say plainly that it did not work.
      track(EVENTS.SHARE_CLICK, { method: "copy_button", ok: 0 });
      setFallback("failed");
    }
  }

  const title = duplicate ? copy.duplicate : copy.title;
  const welcome =
    !duplicate && position !== null
      ? copy.position.replace("{position}", ordinal(position))
      : null;

  return (
    <div className="zw-card zw-card--tall">
      <div aria-live="polite">
        <h2 className="zw-title">{title}</h2>
        {welcome ? <p className="zw-welcome">{welcome}</p> : null}
        {duplicate ? <p className="zw-body">{copy.duplicateBody}</p> : null}
      </div>

      {copy.timeline === "line" ? (
        <p className="zw-body zw-next">{copy.whatNextLine}</p>
      ) : copy.timeline === "full" ? (
        <ol className="zw-timeline">
          {copy.whatNext.map((item) => (
            <li key={item.when}>
              <span className="zw-when">{item.when}</span>
              <span className="zw-what">{item.what}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="zw-share">
        <h3 className="zw-legend">{copy.shareTitle}</h3>
        <Button type="button" variant="secondary" onClick={handleShare}>
          {shared ? copy.shareCopied : copy.shareCta}
        </Button>
        {fallback === "copy" ? (
          <Button type="button" variant="secondary" onClick={handleCopy}>
            {shared ? copy.shareCopied : copy.shareCopyCta}
          </Button>
        ) : null}
        {fallback === "failed" ? <p className="zw-note">{copy.shareCopyFailed}</p> : null}
      </div>
    </div>
  );
}
