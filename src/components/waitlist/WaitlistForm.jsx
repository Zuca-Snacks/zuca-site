// ─── Waitlist orchestrator ───────────────────────────────────────────────────
// Step 1 ships in the initial bundle because it has to be interactive in the
// hero immediately. Step 2 and the confirmation are separate chunks, prefetched
// the moment the email field is focused — so by the time step 1 is submitted the
// code is already in cache and the skeleton is never seen on a normal connection.

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import Step1Email from "./Step1Email.jsx";
import { getState, setState, subscribe } from "./store.js";
import { drainQueue } from "./api.js";
import "./waitlist.css";

const Step2Profile = lazy(() => import("./Step2Profile.jsx"));
const Confirmation = lazy(() => import("./Confirmation.jsx"));

let prefetched = false;
function prefetchStep2() {
  if (prefetched) return;
  prefetched = true;
  import("./Step2Profile.jsx");
  import("./Confirmation.jsx");
}

/** Same height as the card it replaces, so the swap cannot shift the page. */
function Skeleton() {
  return (
    <div className="zw-card zw-card--tall" aria-hidden="true">
      <div className="zw-skeleton">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default function WaitlistForm({ location = "hero" }) {
  const [shared, setShared] = useState(getState);
  // Stamped once per mount. The server uses it to reject sub-2s bot submits.
  const [formRenderTs] = useState(() => Date.now());
  const headingRef = useRef(null);
  const advanced = useRef(false);

  useEffect(() => subscribe(setShared), []);

  useEffect(() => {
    // Replay anything a previous session failed to deliver.
    drainQueue();
    const onOnline = () => drainQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Move focus to the new heading when the stage changes, so a keyboard or
  // screen-reader user lands on the new content instead of the top of the page.
  useEffect(() => {
    if (!advanced.current) return;
    headingRef.current?.focus();
  }, [shared.stage]);

  const handleStep1Success = useCallback(({ email, duplicate, position }) => {
    advanced.current = true;
    setState({ stage: "profile", email, duplicate, position });
  }, []);

  const handleStep2Done = useCallback(() => {
    setState({ stage: "done", profileSaved: true });
  }, []);

  const handleStep2Skip = useCallback(() => {
    setState({ stage: "done", profileSaved: false });
  }, []);

  return (
    <div className="zw">
      <h2 ref={headingRef} tabIndex={-1} className="zw-sr">
        {shared.stage === "email"
          ? "Join the Zuca waitlist"
          : shared.stage === "profile"
            ? "You're on the list. Optional questions."
            : "You're on the list."}
      </h2>

      {shared.stage === "email" ? (
        <Step1Email
          formRenderTs={formRenderTs}
          location={location}
          onSuccess={handleStep1Success}
          prefetchStep2={prefetchStep2}
        />
      ) : null}

      {shared.stage === "profile" ? (
        <Suspense fallback={<Skeleton />}>
          <Step2Profile
            email={shared.email}
            formRenderTs={formRenderTs}
            onName={(n) => setState({ name: n })}
            onDone={handleStep2Done}
            onSkip={handleStep2Skip}
          />
        </Suspense>
      ) : null}

      {shared.stage === "done" ? (
        <Suspense fallback={<Skeleton />}>
          <Confirmation
            position={shared.position}
            name={shared.name}
            duplicate={shared.duplicate}
            profileSaved={shared.profileSaved}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
