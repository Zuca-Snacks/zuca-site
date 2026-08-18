// ─── Step 2 — optional profile, across four screens ──────────────────────────
// Everything here is optional. The email was banked in step 1, so nothing on
// these screens can cost a signup — which is the whole reason it is safe to ask
// for this much.
//
// TWO DESIGN RULES DOING REAL WORK:
//
//  1. SAVE ON EVERY ADVANCE. Each Continue upserts the record so far. Someone
//     who leaves on screen 3 keeps screens 1 and 2 — under a single submit at
//     the end they would have kept nothing. Abandonment is the normal case in a
//     four-screen form, so it should be the case that loses least.
//
//  2. CONSENT BEFORE COLLECTION, EVERY TIME. Health, SMS and postal each sit
//     behind their own unchecked box, and their inputs stay disabled until it
//     is ticked. Never the reverse: collecting first and asking after is
//     cheaper on layout and is not consent.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "../ui/Button.jsx";
import Input from "../ui/Input.jsx";
import Field from "../ui/Field.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import Select from "../ui/Select.jsx";
import { ChipMultiGroup, ChipRadioGroup } from "./chipGroups.jsx";
import { OtherInput, Progress } from "../ui/index.js";
import {
  ADDRESS, CHANNEL, COMPANY_HEADCOUNT, COMPANY_NAME, DIETARY, FLAVOR, INTENT,
  IS_CLINICIAN, MOTIVATION, OFFICE_INTEREST, otherMaxFor, PHONE, PRICE_BAND,
  QUANTITY_BAND, REFERRAL_SOURCE, RESEARCH_OPTIN, ZIP,
} from "./fields.js";
import { step2 as copy } from "../../content/copy.js";
import { buildPayload, RESULT, submitWaitlist, toE164 } from "./api.js";
import { EVENTS, track, trackOnce } from "../../lib/analytics.js";
import { marketingConsent, motivationConsent, postalConsent, smsConsent } from "./consent.js";
import { detectPostalRegion } from "./region.js";
import { COUNTRIES } from "./countries.js";

const ZIP_RE = /^[0-9]{5}$/;
const SCREENS = copy.screens;

// Matches the server's rule exactly. Being laxer here does not help anyone: it
// just moves the rejection from an inline message to a 400 that discards the
// whole submission.
const isE164 = (raw) => toE164(raw) !== null;

export default function Step2Profile({ email, formRenderTs, onDone, onSkip }) {
  const uid = useId();
  const [screen, setScreen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zipError, setZipError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const [consentCopy] = useState(marketingConsent);
  const [healthCopy] = useState(motivationConsent);
  const [smsCopy] = useState(smsConsent);
  const [postalCopy] = useState(postalConsent);
  const [postalRegion] = useState(detectPostalRegion);
  const showZip = postalRegion !== "non_us";

  // One flat bag. Screens read and write slices of it; the payload builder is
  // the only place that knows the wire shape.
  const [v, setV] = useState({
    flavor: null, quantity_band: null,
    intent: null, price_band: null,
    referral_source: null, referral_source_other: "",
    channel: [], channel_other: "",
    zip: "", is_clinician: null,
    motivation: [],
    dietary: [], dietary_other: "",
    office_interest: null, company: "", headcount: null,
    phone: "", research_optin: null,
    address_line1: "", address_line2: "", address_city: "",
    address_region: "", address_postal_code: "", address_country: "",
  });
  const set = (patch) => setV((prev) => ({ ...prev, ...patch }));

  const [consentHealth, setConsentHealth] = useState(false);
  const [consentSms, setConsentSms] = useState(false);
  const [consentPostal, setConsentPostal] = useState(false);

  const inFlight = useRef(false);
  const touched = useRef(new Set());
  const headingRef = useRef(null);

  useEffect(() => {
    trackOnce(EVENTS.STEP2_VIEW, { postal_region: postalRegion });
  }, [postalRegion]);

  useEffect(() => {
    track(EVENTS.STEP2_SCREEN_VIEW, { screen: SCREENS[screen].id, index: screen + 1 });
    if (screen > 0) headingRef.current?.focus();
  }, [screen]);

  /** One event per field, first touch only. Enum values only, never free text. */
  function note(key, value) {
    if (touched.current.has(key)) return;
    touched.current.add(key);
    // Health-adjacent keys emit their name and nothing else.
    const health = key === MOTIVATION.key || key === DIETARY.key;
    track(EVENTS.STEP2_FIELD, health ? { field: key } : { field: key, value: String(value) });
  }

  /** Answers given so far. Gates the address ask and reports completeness. */
  const answered = useMemo(
    () =>
      [v.flavor, v.quantity_band, v.intent, v.price_band, v.referral_source,
       v.zip || null, v.is_clinician, v.office_interest, v.research_optin]
        .filter((x) => x !== null && x !== "").length + (v.channel.length ? 1 : 0),
    [v]
  );

  function payload() {
    return buildPayload({
      email,
      consentMarketing: true,
      consentHealth,
      consentSms,
      consentPostal,
      consentTextVersion: consentCopy.version,
      motivationConsentTextVersion: healthCopy.version,
      smsConsentTextVersion: smsCopy.version,
      postalConsentTextVersion: postalCopy.version,
      formRenderTs,
      profile: { ...v, zip: showZip ? v.zip || null : null },
    });
  }

  /** Upsert what we have. Never blocks the person from moving on. */
  async function save() {
    if (inFlight.current) return true;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const result = await submitWaitlist(payload());
    inFlight.current = false;
    setBusy(false);
    if (result.status === RESULT.OK || result.status === RESULT.DUPLICATE) return true;
    if (result.status === RESULT.RATE_LIMITED) {
      setError("Give that a couple of seconds — your spot is already saved.");
      return false;
    }
    setError("We couldn't save that just now, but your spot is safe. Try again, or skip.");
    return false;
  }

  function validateScreen() {
    if (SCREENS[screen].id === "reach" && showZip && v.zip && !ZIP_RE.test(v.zip)) {
      setZipError("A US ZIP is five digits — or leave it blank.");
      return false;
    }
    if (SCREENS[screen].id === "extras" && consentSms && v.phone && !isE164(v.phone)) {
      setPhoneError("Include the country code, like +1 555 000 0000.");
      return false;
    }
    return true;
  }

  async function advance(e) {
    e.preventDefault();
    if (!validateScreen()) return;
    const ok = await save();
    if (!ok) return;
    track(EVENTS.STEP2_SCREEN_ADVANCE, { screen: SCREENS[screen].id, answered });
    if (screen + 1 < SCREENS.length) setScreen(screen + 1);
    else onDone();
  }

  function skip() {
    trackOnce(EVENTS.STEP2_SKIP, { answered, screen: SCREENS[screen].id });
    onSkip();
  }

  function optin(name, on) {
    track(EVENTS.STEP2_OPTIN, { optin: name, granted: on ? 1 : 0 });
  }

  const s = SCREENS[screen];
  // `id` is REQUIRED by ui/OtherInput — it derives the character-counter's id
  // from it for aria-describedby. Omitting it produced a live reference to
  // "undefined-count", which points at nothing: the counter is rendered but a
  // screen reader is told to read an element that does not exist.
  const otherProps = (def, val, key) => ({
    id: `${key}-${uid}`,
    label: def.otherLabel,
    value: val,
    maxLength: otherMaxFor(def),
    onChange: (t) => set({ [key]: t }),
  });

  return (
    <div className="zw-card zw-card--tall">
      <Progress step={screen + 1} total={SCREENS.length} label={copy.savedNote} />

      <h2 className="zw-title" ref={headingRef} tabIndex={-1}>{s.title}</h2>
      <p className="zw-body">{s.why}</p>

      <form onSubmit={advance} noValidate>
        {s.id === "product" && (
          <>
            <ChipRadioGroup
              legend={FLAVOR.label} name="flavor" options={FLAVOR.options} value={v.flavor}
              onChange={(x) => { set({ flavor: x }); if (x) note(FLAVOR.key, x); }}
            />
            <ChipRadioGroup
              legend={QUANTITY_BAND.label} name="quantity_band" options={QUANTITY_BAND.options}
              value={v.quantity_band}
              onChange={(x) => { set({ quantity_band: x }); if (x) note(QUANTITY_BAND.key, x); }}
            />
          </>
        )}

        {s.id === "value" && (
          <>
            <ChipRadioGroup
              legend={INTENT.label} name="intent" options={INTENT.options} value={v.intent}
              onChange={(x) => { set({ intent: x }); if (x) note(INTENT.key, x); }}
            />
            <ChipRadioGroup
              legend={PRICE_BAND.label} name="price_band" options={PRICE_BAND.options}
              value={v.price_band}
              onChange={(x) => { set({ price_band: x }); if (x) note(PRICE_BAND.key, x); }}
            />
          </>
        )}

        {s.id === "reach" && (
          <>
            <ChipMultiGroup
              legend={CHANNEL.label} options={CHANNEL.options} values={v.channel} max={CHANNEL.max}
              hint={`Pick up to ${CHANNEL.max}.`}
              other={otherProps(CHANNEL, v.channel_other, "channel_other")}
              onChange={(x) => {
                set({ channel: x, ...(x.includes("other") ? {} : { channel_other: "" }) });
                if (x.length) note(CHANNEL.key, x[0]);
              }}
            />
            <ChipRadioGroup
              legend={REFERRAL_SOURCE.label} name="referral_source" options={REFERRAL_SOURCE.options}
              value={v.referral_source}
              other={otherProps(REFERRAL_SOURCE, v.referral_source_other, "referral_source_other")}
              onChange={(x) => {
                set({ referral_source: x, ...(x === "other" ? {} : { referral_source_other: "" }) });
                if (x) note(REFERRAL_SOURCE.key, x);
              }}
            />
            {showZip && (
              <Field
                id={`zip-${uid}`} label={ZIP.label} optional error={zipError}
                hint={postalRegion === "unknown" ? ZIP.hint : undefined}
              >
                {(props) => (
                <Input
                  {...props}
                  type="text" inputMode="numeric" autoComplete="postal-code" maxLength={5}
                  placeholder={ZIP.placeholder} value={v.zip}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 5);
                    set({ zip: d }); if (zipError) setZipError("");
                    if (d.length === 5) note(ZIP.key, "set");
                  }}
                />
                )}
              </Field>
            )}
            <ChipRadioGroup
              legend={IS_CLINICIAN.label} name="is_clinician" options={IS_CLINICIAN.options}
              value={v.is_clinician}
              onChange={(x) => { set({ is_clinician: x }); if (x !== null) note(IS_CLINICIAN.key, x); }}
            />
          </>
        )}

        {s.id === "extras" && (
          <>
            {/* Health — Art 9. One opt-in covering both questions, named in the
                wording, with both chip groups disabled until it is ticked. */}
            <details
              className="zw-disclosure"
              onToggle={(e) => {
                if (e.currentTarget.open) track(EVENTS.STEP2_MOTIVATION_OPEN);
                else { setConsentHealth(false); set({ motivation: [], dietary: [], dietary_other: "" }); }
              }}
            >
              <summary>{copy.motivationDisclosure}</summary>
              <div className="zw-disclosure-body">
                <Checkbox
                  id={`health-${uid}`}
                  className="zw-consent--separate"
                  checked={consentHealth}
                  label={healthCopy.text}
                  onChange={(e) => { const on = e.target.checked;
                    setConsentHealth(on); optin("health", on);
                    if (!on) set({ motivation: [], dietary: [], dietary_other: "" });
                  }}
                />
                <ChipMultiGroup
                  legend={MOTIVATION.label} options={MOTIVATION.options} values={v.motivation}
                  max={MOTIVATION.max} hint={copy.motivationHint} disabled={!consentHealth}
                  onChange={(x) => {
                    set({ motivation: x });
                    if (x.length) note(MOTIVATION.key);
                  }}
                />
                <ChipMultiGroup
                  legend={DIETARY.label} options={DIETARY.options} values={v.dietary}
                  max={DIETARY.max} hint={`Pick up to ${DIETARY.max}.`} disabled={!consentHealth}
                  other={otherProps(DIETARY, v.dietary_other, "dietary_other")}
                  onChange={(x) => {
                    set({ dietary: x, ...(x.includes("other") ? {} : { dietary_other: "" }) });
                    if (x.length) note(DIETARY.key);
                  }}
                />
              </div>
            </details>

            {/* Office. Company details appear only once there is interest. */}
            <ChipRadioGroup
              legend={OFFICE_INTEREST.label} name="office_interest" options={OFFICE_INTEREST.options}
              value={v.office_interest}
              onChange={(x) => { set({ office_interest: x }); if (x) note(OFFICE_INTEREST.key, x); }}
            />
            {(v.office_interest === "yes" || v.office_interest === "maybe") && (
              <div className="zw-nested">
                <Field id={`co-${uid}`} label={COMPANY_NAME.label} optional>
                  {(props) => (
                    <Input
                      {...props} type="text" autoComplete="organization"
                      maxLength={COMPANY_NAME.maxLength} placeholder={COMPANY_NAME.placeholder}
                      value={v.company} onChange={(e) => set({ company: e.target.value })}
                    />
                  )}
                </Field>
                <ChipRadioGroup
                  legend={COMPANY_HEADCOUNT.label} name="headcount"
                  options={COMPANY_HEADCOUNT.options} value={v.headcount}
                  onChange={(x) => { set({ headcount: x }); if (x) note(COMPANY_HEADCOUNT.key, x); }}
                />
              </div>
            )}

            {/* SMS — express written consent, its own box, phone disabled until ticked. */}
            <details
              className="zw-disclosure"
              onToggle={(e) => { if (!e.currentTarget.open) { setConsentSms(false); set({ phone: "" }); setPhoneError(""); } }}
            >
              <summary>{copy.smsDisclosure}</summary>
              <div className="zw-disclosure-body">
                <Checkbox
                  id={`sms-${uid}`}
                  className="zw-consent--separate"
                  checked={consentSms}
                  label={smsCopy.text}
                  onChange={(e) => { const on = e.target.checked; setConsentSms(on); optin("sms", on); if (!on) { set({ phone: "" }); setPhoneError(""); } }}
                />
                <Field id={`ph-${uid}`} label={PHONE.label} optional error={phoneError}>
                  {(props) => (
                    <Input
                      {...props} type="tel" inputMode="tel" autoComplete="tel"
                      maxLength={PHONE.maxLength} placeholder={PHONE.placeholder}
                      value={v.phone} disabled={!consentSms}
                      onChange={(e) => { set({ phone: e.target.value }); if (phoneError) setPhoneError(""); }}
                    />
                  )}
                </Field>
              </div>
            </details>

            {/* Postal — its own opt-in, and only offered once they have told us
                something else. Asking a stranger for their address as the
                opening move is how you lose the stranger. */}
            {answered > 0 ? (
              <details
                className="zw-disclosure"
                onToggle={(e) => {
                  if (!e.currentTarget.open) {
                    setConsentPostal(false);
                    set({ address_line1: "", address_line2: "", address_city: "", address_region: "", address_postal_code: "", address_country: "" });
                  }
                }}
              >
                <summary>{copy.mailDisclosure}</summary>
                <div className="zw-disclosure-body">
                  <Checkbox
                    id={`mail-${uid}`}
                    className="zw-consent--separate"
                    checked={consentPostal}
                    label={postalCopy.text}
                    onChange={(e) => { const on = e.target.checked; setConsentPostal(on); optin("postal", on); }}
                  />
                  <fieldset className="zw-field" disabled={!consentPostal}>
                    <legend className="zw-sr">Postal address</legend>
                    {ADDRESS.fields.map((f) => (
                      <Field key={f.key} id={`${f.key}-${uid}`} label={f.label} optional>
                        {(props) =>
                          f.select ? (
                            <Select
                              {...props} autoComplete={f.autoComplete} value={v[f.key]}
                              onChange={(e) => set({ [f.key]: e.target.value })}
                            >
                              <option value="">Select a country</option>
                              {COUNTRIES.map((c) => (
                                <option key={c.code} value={c.code}>{c.name}</option>
                              ))}
                            </Select>
                          ) : (
                            <Input
                              {...props} type="text" autoComplete={f.autoComplete}
                              maxLength={f.maxLength} value={v[f.key]}
                              onChange={(e) => set({ [f.key]: e.target.value })}
                            />
                          )
                        }
                      </Field>
                    ))}
                  </fieldset>
                </div>
              </details>
            ) : (
              <p className="zw-note">{copy.mailGate}</p>
            )}

            <ChipRadioGroup
              legend={RESEARCH_OPTIN.label} name="research_optin" options={RESEARCH_OPTIN.options}
              value={v.research_optin}
              onChange={(x) => { set({ research_optin: x }); if (x !== null) note(RESEARCH_OPTIN.key, x); }}
            />
          </>
        )}

        <span className="zw-error" role="alert" aria-live="assertive">{error}</span>

        <div className="zw-actions">
          <Button type="submit" variant="primary" disabled={busy} busy={busy} busyLabel={copy.nextBusy}>
            {screen + 1 < SCREENS.length ? copy.next : copy.finish}
          </Button>
          {screen > 0 && (
            <Button variant="secondary" onClick={() => setScreen(screen - 1)} disabled={busy}>
              {copy.back}
            </Button>
          )}
          <Button variant="ghost" onClick={skip} disabled={busy}>{copy.skip}</Button>
        </div>
      </form>
    </div>
  );
}
