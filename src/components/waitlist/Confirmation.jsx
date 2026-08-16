// ─── Confirmation ────────────────────────────────────────────────────────────
// The highest-attention moment on the site. It gets a real position number,
// a dated expectation, and one thing to do next.

import { useEffect, useState } from "react";
import { Button } from "./primitives.jsx";
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

  async function handleShare() {
    const url = shareUrl();
    track(EVENTS.SHARE_CLICK, { method: typeof navigator !== "undefined" && navigator.share ? "native" : "copy" });
    try {
      if (navigator.share) {
        await navigator.share({ title: "Zuca", text: copy.shareText, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } catch {
      /* the user dismissed the share sheet — not an error worth showing */
    }
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
        <Button variant="secondary" onClick={handleShare}>
          {shared ? copy.shareCopied : copy.shareCta}
        </Button>
      </div>
    </div>
  );
}
