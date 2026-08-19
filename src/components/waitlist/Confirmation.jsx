// ─── Confirmation ────────────────────────────────────────────────────────────
// The highest-attention moment on the site. It gets a real position number,
// a dated expectation, and one thing to do next.

import { useEffect, useState } from "react";
import Button from "../ui/Button.jsx";
import { confirmation as copy } from "../../content/copy.js";
import { fetchCount } from "./api.js";
import { EVENTS, track } from "../../lib/analytics.js";

function shareUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin + window.location.pathname);
  // Tag the referral so a shared link is attributable, and so it doesn't get
  // credited to the outbound email campaign.
  url.searchParams.set("utm_source", "referral");
  url.searchParams.set("utm_medium", "share");
  return url.toString();
}

export default function Confirmation({ position: knownPosition, duplicate, profileSaved }) {
  const [position, setPosition] = useState(knownPosition ?? null);
  const [shared, setShared] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

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
   * Share, with every fallback reachable.
   *
   * The old version returned immediately after `navigator.share`, so a share
   * sheet that THREW — which is the normal desktop outcome, where the API
   * exists but refuses the payload — fell into a catch that swallowed it and
   * did nothing at all. The button looked dead because it was: an unsupported
   * path was treated as a completed one.
   *
   * Now every branch ends in visible feedback, including the failure.
   */
  async function handleShare() {
    const url = shareUrl();

    if (navigator.share) {
      try {
        await navigator.share({ title: "Zuca", text: copy.shareText, url });
        track(EVENTS.SHARE_CLICK, { method: "native", ok: 1 });
        return;
      } catch (err) {
        // AbortError means they opened the sheet and chose not to share. That
        // is a completed interaction, not a failure to fall back from.
        if (err && err.name === "AbortError") {
          track(EVENTS.SHARE_CLICK, { method: "native", ok: 0 });
          return;
        }
        // Anything else: the API is present but unusable here. Keep going.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      track(EVENTS.SHARE_CLICK, { method: "copy", ok: 1 });
      setShared(true);
      window.setTimeout(() => setShared(false), 3000);
      return;
    } catch {
      /* No clipboard permission, or an insecure context. One path left. */
    }

    // Last resort: put the link on screen so it can be copied by hand. A
    // visible link they can select beats a button that silently does nothing.
    track(EVENTS.SHARE_CLICK, { method: "manual", ok: 1 });
    setManualUrl(url);
  }

  const title = duplicate
    ? copy.duplicate
    : position !== null
      ? copy.title.replace("{position}", position.toLocaleString())
      : copy.titleFallback;

  return (
    <div className="zw-card zw-card--tall">
      <div aria-live="polite">
        {!duplicate && position !== null ? (
          <p className="zw-position">#{position.toLocaleString()}</p>
        ) : null}
        <h2 className="zw-title">{title}</h2>
        <p className="zw-body">
          {duplicate
            ? copy.duplicateBody
            : profileSaved
              ? "Thanks — those answers go straight into what we produce first."
              : "Your spot is saved. Here's what happens from here."}
        </p>
      </div>

      <ol className="zw-timeline">
        {copy.whatNext.map((item) => (
          <li key={item.when}>
            <span className="zw-when">{item.when}</span>
            <span className="zw-what">{item.what}</span>
          </li>
        ))}
      </ol>

      <div className="zw-share">
        <h3 className="zw-legend">{copy.shareTitle}</h3>
        <p className="zw-body">{copy.shareBody}</p>
        <Button type="button" variant="secondary" onClick={handleShare}>
          {shared ? copy.shareCopied : copy.shareCta}
        </Button>
        {manualUrl ? (
          <p className="zw-note">
            {copy.shareManual}{" "}
            <a href={manualUrl}>{manualUrl}</a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
