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
import { BUSINESS_BASIS_LIVE, buildPayload, RESULT, submitWaitlist } from "./api.js";
import { EVENTS, observeOnce, track, trackOnce } from "../../lib/analytics.js";
import { businessConsent, marketingConsent } from "./consent.js";
import { looksLikeRoleAddress } from "./roleAddress.js";
import { bumpCount } from "./countStore.js";

// Deliberately permissive: the server is the authority on validity, and a
// strict client regex rejects real addresses. This catches typos, not edge cases.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Step1Email({ formRenderTs, location = "hero", onSuccess, prefetchStep2 }) {
  // Resolved once per mount. Uncertain detection deliberately yields the
  // stricter EEA wording — see consent.js. `consent.version` records what was
  // actually shown, so the evidence is truthful even if the region guess isn't.
  const [consentCopy] = useState(marketingConsent);
  const [businessCopy] = useState(businessConsent);

  // The shared-inbox path. `businessOffered` is set either by our local-part
  // mirror while they type, or by a validation rejection of an address that
  // passed every check we can make — the second is what catches a list that
  // has drifted, since the server's 400 never says which rule fired.
  const [businessOffered, setBusinessOffered] = useState(false);
  const [businessTicked, setBusinessTicked] = useState(false); // never pre-checked

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
  const businessId = `zw-consent-business-${uid}`;

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

  /**
   * Offer the business basis, once, recording why it was offered.
   *
   * It never blocks and never pre-empts the server. Showing the box early only
   * saves a doomed round trip for addresses we happen to recognise; the server
   * remains the only thing that decides whether the address is acceptable.
   */
  function offerBusiness(via) {
    if (!BUSINESS_BASIS_LIVE) return;
    setBusinessOffered((already) => {
      if (!already) track(EVENTS.BUSINESS_OFFERED, { location, via });
      return true;
    });
  }

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
    // Checked separately so the message can name the actual problem. The
    // server rejects ".." too, but only as a generic validation failure, and
    // "shared inboxes aren't accepted" is a baffling thing to read when what
    // you did was type a dot twice.
    if (value.includes("..")) {
      setError(copy.errors.typo);
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
    // Only true when the box is BOTH available and ticked. buildPayload drops
    // the keys entirely when false — sending `business_enquiry` speculatively
    // would suppress this person's marketing consent server-side.
    const sendingBusiness = BUSINESS_BASIS_LIVE && businessOffered && businessTicked;
    track(EVENTS.STEP1_SUBMIT, {
      location,
      consent_region: consentCopy.region,
      business: sendingBusiness ? 1 : 0,
    });

    const payload = buildPayload({
      email: value,
      consentMarketing: true,
      consentTextVersion: consentCopy.version,
      businessEnquiry: sendingBusiness,
      businessConsentTextVersion: sendingBusiness ? businessCopy.version : null,
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
        // Carried so the confirmation does not promise a launch email the
        // server has just committed to never sending.
        business: sendingBusiness,
        // The credential steps 2-4 need to UPDATE this row instead of being
        // refused as a duplicate. Null on a duplicate signup and null if the
        // server did not mint one; step 2 copes either way, exactly as it had
        // to before S23 existed.
        editToken: result.editToken ?? null,
      });
      return;
    }

    // Rollback: stay on step 1, keep what they typed, say something a human
    // would say. The raw error code never reaches the screen.
    track(EVENTS.STEP1_ERROR, { reason: result.status });

    // The server refused an address that passed every check we can make, and
    // its 400 body is {ok, error} — the rule name goes to its audit log, not to
    // us. A shared inbox is the most likely cause we can actually do something
    // about, so offer the route rather than asserting the diagnosis. Skipped
    // once they have already ticked it: the box is plainly not the problem.
    if (result.status === RESULT.VALIDATION && BUSINESS_BASIS_LIVE && !businessTicked) {
      offerBusiness("rejected");
      setError(copy.errors.business_hint);
      inputRef.current?.focus();
      return;
    }

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
                const next = e.target.value;
                setEmail(next);
                if (error) setError("");
                // Offer, never retract: someone mid-way through typing
                // `office@…` should not watch the box appear and vanish.
                if (looksLikeRoleAddress(next)) offerBusiness("local_part");
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

        {/* Separated from the marketing consent above it for the same reason
            the health opt-in is: two consents in one visual block read as one
            consent, and this one carries a different legal basis entirely. */}
        {businessOffered ? (
          <div className="zw-consent--separate">
            <p className="zw-note">{copy.businessPrompt}</p>
            <Checkbox
              id={businessId}
              consentVersion={businessCopy.version}
              checked={businessTicked}
              label={businessCopy.text}
              onChange={(e) => {
                const next = e.target.checked;
                setBusinessTicked(next);
                if (next) {
                  track(EVENTS.BUSINESS_TICKED, { location });
                  setError("");
                }
              }}
            />
          </div>
        ) : null}

        <Button type="submit" size="lg" block disabled={busy} loading={busy}>
          {copy.cta}
        </Button>

        <p className="zw-fine">{hero.reassurance}</p>
      </form>
    </div>
  );
}
