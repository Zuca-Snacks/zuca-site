// ─── Step 1 — one field ──────────────────────────────────────────────────────
// Email, one consent checkbox, one button. Nothing else. The POST fires here,
// before step 2 is ever shown, so an abandoned step 2 still leaves us the email.
//
// MERGE NOTE: the stand-in primitives this file used to import are gone. It now
// renders on the UX agent's <Field>/<Input>/<Checkbox>/<Button>. All validation,
// analytics, consent wording and error copy below is unchanged from growth.

import { useEffect, useId, useRef, useState } from "react";
import Button from "../ui/Button.jsx";
import Input from "../ui/Input.jsx";
import Field from "../ui/Field.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import { step1 as copy, hero } from "../../content/copy.js";
import { buildPayload, RESULT, submitWaitlist } from "./api.js";
import { EVENTS, observeOnce, track, trackOnce } from "../../lib/analytics.js";
import { marketingConsent } from "./consent.js";
import { bumpCount } from "./countStore.js";

// Deliberately permissive: the server is the authority on validity, and a
// strict client regex rejects real addresses. This catches typos, not edge cases.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Step1Email({ formRenderTs, location = "hero", onSuccess, prefetchStep2 }) {
  // Resolved once per mount. Uncertain detection deliberately yields the
  // stricter EEA wording — see consent.js. `consent.version` records what was
  // actually shown, so the evidence is truthful even if the region guess isn't.
  const [consentCopy] = useState(marketingConsent);

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false); // never pre-checked
  const [hp, setHp] = useState("");
  const [error, setError] = useState("");
  const [consentError, setConsentError] = useState("");
  const [busy, setBusy] = useState(false);

  // The ids stay unique per instance. The form is mounted once today, but
  // nothing here assumes that, and a duplicated id silently repoints the second
  // form's labels at the first form's inputs.
  const uid = useId();
  const emailId = `zw-email-${uid}`;
  const hpId = `zw-website-${uid}`;
  const consentId = `zw-consent-marketing-${uid}`;

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const focusTracked = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!rootRef.current) return undefined;
    return observeOnce(rootRef.current, EVENTS.HERO_CTA_VIEW, { location });
  }, [location]);

  // The hero's email field is a presentational shell that POSTs nowhere — it
  // dispatches what was typed and scrolls here. Pick the value up so the
  // visitor never types their address twice. See HANDOFF-ux.md.
  useEffect(() => {
    function onHeroEmail(e) {
      const value = e.detail?.email;
      if (!value) return;
      setEmail(value);
      setError("");
      // Focus lands on the consent box rather than the prefilled field: the
      // address is already there, and ticking consent is the remaining step.
      window.requestAnimationFrame(() => {
        document.getElementById(consentId)?.focus();
      });
      prefetchStep2?.();
    }
    window.addEventListener("zuca:hero-email", onHeroEmail);
    return () => window.removeEventListener("zuca:hero-email", onHeroEmail);
  }, [consentId, prefetchStep2]);

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
    track(EVENTS.STEP1_SUBMIT, { location, consent_region: consentCopy.region });

    const payload = buildPayload({
      email: value,
      consentMarketing: true,
      consentTextVersion: consentCopy.version,
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
      // Optimistic +1, reconciled against the server a beat later. Not fired
      // for a duplicate: they were already counted, and showing them adding a
      // person who does not exist is a small lie the server would undo anyway.
      if (result.status !== RESULT.DUPLICATE) bumpCount();
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
      <form className="z-waitlist-mount" onSubmit={handleSubmit} noValidate>
        <Field id={emailId} label={copy.label} error={error}>
          {(props) => (
            <Input
              {...props}
              ref={inputRef}
              type="email"
              name="email"
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
          )}
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

        {/* consentVersion is derived from a hash of the wording itself (see
            consent.js), so it cannot drift from the text it certifies. */}
        <Checkbox
          id={consentId}
          consentVersion={consentCopy.version}
          checked={consent}
          error={consentError}
          label={consentCopy.text}
          legal={<a href={consentCopy.privacyHref}>{consentCopy.privacyLabel}</a>}
          onChange={(e) => {
            const next = e.target.checked;
            setConsent(next);
            if (next) setConsentError("");
          }}
        />

        <Button type="submit" size="lg" block disabled={busy} loading={busy}>
          {copy.cta}
        </Button>

        <p className="zw-fine">{hero.reassurance}</p>
      </form>
    </div>
  );
}
