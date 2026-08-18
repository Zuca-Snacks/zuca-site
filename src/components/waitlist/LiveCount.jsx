// ─── The number, and the +1 ──────────────────────────────────────────────────
// Renders nothing until a real count exists. A missing number must never render
// as "0 on the waitlist" — that is a claim, and a false one.

import { useEffect, useState } from "react";
import { clearBump, getCount, loadCount, subscribe } from "./countStore.js";
import { proof } from "../../content/copy.js";

export default function LiveCount({ className = "" }) {
  const [state, setState] = useState(getCount);

  useEffect(() => {
    const off = subscribe(setState);
    loadCount();
    return off;
  }, []);

  // Clear the flag once the animation has run, so it plays once per signup
  // rather than on every re-render that happens to follow one.
  useEffect(() => {
    if (!state.bumped) return undefined;
    const t = setTimeout(clearBump, 700);
    return () => clearTimeout(t);
  }, [state.bumped]);

  if (state.value == null || state.value <= 0) return null;

  return (
    <p className={`zw-live ${className}`.trim()}>
      {/* aria-live so the increment is announced, not just seen. */}
      <span className="zw-live-num" data-bumped={state.bumped ? "true" : "false"} aria-live="polite">
        {state.value.toLocaleString()}
      </span>
      <span className="zw-live-word">{proof.liveLabel}</span>
    </p>
  );
}
