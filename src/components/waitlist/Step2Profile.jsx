// ─── Step 2 — optional profile ───────────────────────────────────────────────
// Lazy-loaded. Everything here is optional: the email is already saved by the
// time this renders, and the skip is always visible. Chips over dropdowns, zero
// free text, one scrollable card.

import { useEffect, useId, useRef, useState } from "react";
import { Button, ChipMultiGroup, ChipRadioGroup, Consent, Field, Input } from "./primitives.jsx";
import { FLAVOR, INTENT, IS_CLINICIAN, MOTIVATION, PRICE_BAND, REFERRAL_SOURCE, ZIP } from "./fields.js";
import { step2 as copy } from "../../content/copy.js";
import { buildPayload, RESULT, submitWaitlist } from "./api.js";
import { EVENTS, track, trackOnce } from "../../lib/analytics.js";
import { marketingConsent, motivationConsent } from "./consent.js";
import { detectPostalRegion } from "./region.js";

const ZIP_RE = /^[0-9]{5}$/;

export default function Step2Profile({ email, formRenderTs, onDone, onSkip }) {
  const [consentCopy] = useState(marketingConsent);
  const [motivationCopy] = useState(motivationConsent);
  // 'us' → show it plainly. 'unknown' → show it with the "US only" hint.
  // 'non_us' → don't ask at all; a field you have to be told to skip is still
  // friction, and geography comes from the server-derived country anyway.
  const [postalRegion] = useState(detectPostalRegion);
  const showZip = postalRegion !== "non_us";

  const [flavor, setFlavor] = useState(null);
  const [intent, setIntent] = useState(null);
  const [priceBand, setPriceBand] = useState(null);
  const [motivationOptIn, setMotivationOptIn] = useState(false); // separate, never bundled
  const [motivation, setMotivation] = useState([]);
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState("");
  const [referral, setReferral] = useState(null);
  const [isClinician, setIsClinician] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Unique per instance — this component can be mounted twice on one page.
  const uid = useId();
  const zipId = `zw-zip-${uid}`;
  const zipErrorId = `zw-zip-error-${uid}`;
  const motivationConsentId = `zw-consent-motivation-${uid}`;

  const inFlight = useRef(false);
  const touched = useRef(new Set());

  useEffect(() => {
    trackOnce(EVENTS.STEP2_VIEW, { postal_region: postalRegion });
  }, [postalRegion]);

  /** One event the first time a field is touched. Enum values only. */
  function noteField(key, value) {
    if (touched.current.has(key)) return;
    touched.current.add(key);
    // `motivation` values are health-adjacent — the count goes out, never the values.
    if (key === MOTIVATION.key) {
      track(EVENTS.STEP2_FIELD, { field: key });
    } else {
      track(EVENTS.STEP2_FIELD, { field: key, value: String(value) });
    }
  }

  function handleZip(next) {
    const digits = next.replace(/\D/g, "").slice(0, 5);
    setZip(digits);
    if (zipError) setZipError("");
    if (digits.length === 5) noteField(ZIP.key, "set");
  }

  function answeredCount() {
    return [flavor, intent, priceBand, referral, isClinician].filter((v) => v !== null).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (inFlight.current) return;

    if (showZip && zip && !ZIP_RE.test(zip)) {
      setZipError("A US ZIP is five digits — or leave it blank.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setError("");
    trackOnce(EVENTS.STEP2_SUBMIT, {
      answered: answeredCount(),
      motivation_opt_in: motivationOptIn ? 1 : 0,
      motivation_count: motivationOptIn ? motivation.length : 0,
      has_zip: showZip && zip ? 1 : 0,
      postal_region: postalRegion,
    });

    const payload = buildPayload({
      email,
      consentMarketing: true,
      consentHealth: motivationOptIn,
      // The marketing consent is what `consent_marketing: true` refers to, so
      // its version is what this field must carry. The motivation opt-in has
      // its own wording and its own version, and the contract has nowhere to
      // put it yet — see HANDOFF-growth.md.
      consentTextVersion: consentCopy.version,
      motivationConsentTextVersion: motivationOptIn ? motivationCopy.version : null,
      formRenderTs,
      profile: {
        flavor,
        intent,
        price_band: priceBand,
        // Stored only when the separate opt-in is ticked.
        motivation: motivationOptIn ? motivation : null,
        zip: showZip ? zip || null : null,
        referral_source: referral,
        is_clinician: isClinician,
      },
    });

    const result = await submitWaitlist(payload);
    inFlight.current = false;
    setBusy(false);

    // The email is already banked. A duplicate here means the record exists and
    // the profile was an update — success either way. Only a hard failure is
    // worth telling them about, and even then their spot is safe.
    if (result.status === RESULT.OK || result.status === RESULT.DUPLICATE) {
      onDone();
      return;
    }
    if (result.status === RESULT.RATE_LIMITED) {
      setError("Give that a few seconds and try once more — your spot is already saved.");
      return;
    }
    setError("We couldn't save those answers, but your spot on the list is safe. Try once more, or skip.");
  }

  function handleSkip() {
    trackOnce(EVENTS.STEP2_SKIP, { answered: answeredCount() });
    onSkip();
  }

  return (
    <div className="zw-card zw-card--tall">
      <h2 className="zw-title">{copy.title}</h2>
      <p className="zw-body">{copy.body}</p>

      <form onSubmit={handleSubmit} noValidate>
        <ChipRadioGroup
          legend={FLAVOR.label}
          name="flavor"
          options={FLAVOR.options}
          value={flavor}
          onChange={(v) => {
            setFlavor(v);
            if (v) noteField(FLAVOR.key, v);
          }}
        />

        <ChipRadioGroup
          legend={INTENT.label}
          name="intent"
          options={INTENT.options}
          value={intent}
          onChange={(v) => {
            setIntent(v);
            if (v) noteField(INTENT.key, v);
          }}
        />

        <ChipRadioGroup
          legend={PRICE_BAND.label}
          name="price_band"
          options={PRICE_BAND.options}
          value={priceBand}
          onChange={(v) => {
            setPriceBand(v);
            if (v) noteField(PRICE_BAND.key, v);
          }}
        />

        {/* The health question costs nothing to anyone who doesn't open it.
            Note the order inside: the opt-in comes FIRST and the chips stay
            disabled until it is ticked. Collecting first and asking after
            would be cheaper on space and would not be consent. */}
        <details
          className="zw-disclosure"
          onToggle={(e) => {
            if (e.currentTarget.open) track(EVENTS.STEP2_MOTIVATION_OPEN);
            else {
              // Closing it retracts the opt-in and the answers with it, so the
              // collapsed state can never hide data we are still holding.
              setMotivationOptIn(false);
              setMotivation([]);
            }
          }}
        >
          <summary>{copy.motivationDisclosure}</summary>
          <div className="zw-disclosure-body">
            <Consent
              id={motivationConsentId}
              separate
              checked={motivationOptIn}
              onChange={(next) => {
                setMotivationOptIn(next);
                if (!next) setMotivation([]);
              }}
            >
              {motivationCopy.text}
            </Consent>

            <ChipMultiGroup
              legend={MOTIVATION.label}
              options={MOTIVATION.options}
              values={motivation}
              max={MOTIVATION.max}
              hint={copy.motivationHint}
              disabled={!motivationOptIn}
              onChange={(next) => {
                setMotivation(next);
                if (next.length) noteField(MOTIVATION.key);
              }}
            />
          </div>
        </details>

        {showZip ? (
          <Field
            error={zipError}
            errorId={zipErrorId}
            hint={postalRegion === "unknown" ? ZIP.hint : undefined}
          >
            <Input
              id={zipId}
              label={ZIP.label}
              error={zipError}
              errorId={zipErrorId}
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              enterKeyHint="next"
              maxLength={5}
              placeholder={ZIP.placeholder}
              value={zip}
              onChange={(e) => handleZip(e.target.value)}
            />
          </Field>
        ) : null}

        <ChipRadioGroup
          legend={REFERRAL_SOURCE.label}
          name="referral_source"
          options={REFERRAL_SOURCE.options}
          value={referral}
          onChange={(v) => {
            setReferral(v);
            if (v) noteField(REFERRAL_SOURCE.key, v);
          }}
        />

        <ChipRadioGroup
          legend={IS_CLINICIAN.label}
          name="is_clinician"
          options={IS_CLINICIAN.options}
          value={isClinician}
          onChange={(v) => {
            setIsClinician(v);
            if (v !== null) noteField(IS_CLINICIAN.key, v);
          }}
        />

        <span className="zw-error" role="alert" aria-live="assertive">
          {error}
        </span>

        <div className="zw-actions">
          <Button type="submit" variant="primary" disabled={busy} busy={busy} busyLabel={copy.ctaBusy}>
            {copy.cta}
          </Button>
          <Button variant="ghost" onClick={handleSkip} disabled={busy}>
            {copy.skip}
          </Button>
        </div>
      </form>
    </div>
  );
}
