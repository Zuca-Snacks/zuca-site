// ─── Step 1 — one field ──────────────────────────────────────────────────────
// Email, one consent checkbox, one button. Nothing else. The POST fires here,
// before step 2 is ever shown, so an abandoned step 2 still leaves us the email.

import { useEffect, useId, useRef, useState } from "react";
import { Button, Consent, Field, Input } from "./primitives.jsx";
import { step1 as copy, hero } from "../../content/copy.js";
import { buildPayload, RESULT, submitWaitlist } from "./api.js";
import { EVENTS, observeOnce, track, trackOnce } from "../../lib/analytics.js";

// Deliberately permissive: the server is the authority on validity, and a
// strict client regex rejects real addresses. This catches typos, not edge cases.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Step1Email({ formRenderTs, location = "hero", onSuccess, prefetchStep2 }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false); // never pre-checked
  const [hp, setHp] = useState("");
  const [error, setError] = useState("");
  const [consentError, setConsentError] = useState("");
  const [busy, setBusy] = useState(false);

  // The form is mounted twice (hero and footer). Every id must be unique per
  // instance or the second form's labels resolve to the first form's inputs.
  const uid = useId();
  const emailId = `zw-email-${uid}`;
  const errorId = `zw-email-error-${uid}`;
  const hpId = `zw-website-${uid}`;
  const consentId = `zw-consent-marketing-${uid}`;
  const consentErrorId = `zw-consent-error-${uid}`;

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const focusTracked = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!rootRef.current) return undefined;
    return observeOnce(rootRef.current, EVENTS.HERO_CTA_VIEW, { location });
  }, [location]);

  function handleFocus() {
    if (focusTracked.current) return;
    focusTracked.current = true;
    trackOnce(EVENTS.EMAIL_FIELD_FOCUS, { location });
    // Warm the step 2 chunk while they type, so the transition is instant and
    // the Suspense skeleton is never actually seen on a normal connection.
    prefetchStep2?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (inFlight.current) return; // hard double-submit guard
    const value = email.trim().toLowerCase();

    if (!value) {
      setError(copy.errors.empty);
      inputRef.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(value) || value.length > 254) {
      setError(copy.errors.invalid);
      inputRef.current?.focus();
      return;
    }
    if (!consent) {
      setConsentError(copy.errors.consent);
      document.getElementById(consentId)?.focus();
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setError("");
    setConsentError("");
    track(EVENTS.STEP1_SUBMIT, { location });

    const payload = buildPayload({
      email: value,
      consentMarketing: true,
      formRenderTs,
      hpField: hp,
    });

    const result = await submitWaitlist(payload);

    inFlight.current = false;
    setBusy(false);

    if (result.status === RESULT.OK || result.status === RESULT.DUPLICATE) {
      track(EVENTS.STEP1_SUCCESS, {
        duplicate: result.status === RESULT.DUPLICATE ? 1 : 0,
        via: result.via,
      });
      onSuccess({
        email: value,
        duplicate: result.status === RESULT.DUPLICATE,
        position: result.position ?? null,
      });
      return;
    }

    // Rollback: stay on step 1, keep what they typed, say something a human
    // would say. The raw error code never reaches the screen.
    track(EVENTS.STEP1_ERROR, { reason: result.status });
    setError(copy.errors[result.status] || copy.errors.server);
    inputRef.current?.focus();
  }

  return (
    <div className="zw-card" ref={rootRef}>
      <form onSubmit={handleSubmit} noValidate>
        <Field error={error} errorId={errorId}>
          <Input
            id={emailId}
            ref={inputRef}
            label={copy.label}
            error={error}
            errorId={errorId}
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="go"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder={copy.placeholder}
            value={email}
            disabled={busy}
            onFocus={handleFocus}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
          />
        </Field>

        {/* Honeypot — off-screen, not display:none, so a naive bot fills it. */}
        <div className="zw-hp" aria-hidden="true">
          <label htmlFor={hpId}>Website</label>
          <input
            id={hpId}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </div>

        <Consent
          id={consentId}
          checked={consent}
          describedBy={consentError ? consentErrorId : undefined}
          onChange={(next) => {
            setConsent(next);
            if (next) setConsentError("");
          }}
        >
          {copy.consent} <a href={copy.privacyHref}>{copy.privacyLabel}</a>
        </Consent>
        <span className="zw-error" id={consentErrorId} role="alert" aria-live="assertive">
          {consentError}
        </span>

        <Button type="submit" variant="primary" disabled={busy} busy={busy} busyLabel={copy.ctaBusy}>
          {copy.cta}
        </Button>

        <p className="zw-fine">{hero.reassurance}</p>
      </form>
    </div>
  );
}
