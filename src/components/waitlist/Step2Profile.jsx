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
  IS_CLINICIAN, MOTIVATION, NAME, OFFICE_INTEREST, otherMaxFor, PHONE, PRICE_BAND,
  QUANTITY_BAND, REFERRAL_SOURCE, RESEARCH_OPTIN,
} from "./fields.js";
import { step2 as copy } from "../../content/copy.js";
import { buildPayload, RESULT } from "./api.js";
import { queueSave, settleSaves } from "./saveQueue.js";
import { getFbCookies, isPixelEnabled, newEventId, trackLead } from "../../lib/metaPixel.js";
import { EVENTS, track, trackOnce, trackScreen } from "../../lib/analytics.js";
import { marketingConsent, motivationConsent, postalConsent, smsConsent } from "./consent.js";
import { detectPostalRegion } from "./region.js";
import { COUNTRY_OPTIONS } from "./countries.js";
import { assemblePhone, DIAL_CODES, defaultDialCountry } from "./phone.js";

const SCREENS = copy.screens;

// Matches the server's rule exactly. Being laxer here does not help anyone: it
// just moves the rejection from an inline message to a 400 that discards the
// whole submission.

export default function Step2Profile({ email, editToken = null, formRenderTs, onDone, onSkip, onName }) {
  const uid = useId();
  const [screen, setScreen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  // Visible and changeable, never inferred silently. The IP-derived country is
  // server-side only, so this is a time-zone hint rendered as a selected option
  // — a wrong guess costs one tap, not a stranger's number.
  const [dialCountry, setDialCountry] = useState(defaultDialCountry);
  // The message that appears AT THE BUTTON. A refusal has to be visible at the
  // point of the press: the field error can be — and was — above the fold, so
  // pressing submit looked like pressing a dead control.
  const [blockedMsg, setBlockedMsg] = useState("");
  // id -> element, so a blocked submit can move the person to the field that
  // is actually blocking rather than to the top of the form.
  const fieldEls = useRef({});
  // ⚠️ FIRE-ONCE GUARD FOR Lead. A re-render, a retry after a failed settle, or
  // the save queue pumping twice must not produce two Lead events. The shared
  // event_id would let Meta collapse a duplicate, but that is the backstop, not
  // the defence — relying on it means shipping a known double-fire and trusting
  // someone else's deduplication to hide it.
  const leadFired = useRef(false);
  const registerField = (id) => (el) => { if (el) fieldEls.current[id] = el; };

  const [consentCopy] = useState(marketingConsent);
  const [healthCopy] = useState(motivationConsent);
  const [smsCopy] = useState(smsConsent);
  const [postalCopy] = useState(postalConsent);
  const [postalRegion] = useState(detectPostalRegion);

  // One flat bag. Screens read and write slices of it; the payload builder is
  // the only place that knows the wire shape.
  const [v, setV] = useState({
    name: "",
    flavor: null, quantity_band: null,
    intent: null, price_band: null,
    referral_source: null, referral_source_other: "",
    price_band_other: "",
    channel: [], channel_other: "",
    is_clinician: null,
    motivation: [], motivation_other: "",
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

  // Fingerprint of the last record the server accepted. Moving Back and forward
  // again re-submitted a byte-identical payload, which the rate limiter
  // correctly refused — and the refusal surfaced as red text blocking a
  // navigation the person had every right to make. Navigating is not saving.
  const lastSaved = useRef("");
  const touched = useRef(new Set());
  const headingRef = useRef(null);

  useEffect(() => {
    trackOnce(EVENTS.STEP2_VIEW, { postal_region: postalRegion });
  }, [postalRegion]);

  useEffect(() => {
    trackScreen(EVENTS.STEP2_SCREEN_VIEW, screen, { screen: SCREENS[screen].id });
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
       v.is_clinician, v.office_interest, v.research_optin]
        .filter((x) => x !== null && x !== "").length + (v.channel.length ? 1 : 0),
    [v]
  );

  function payload(meta) {
    return buildPayload({
      meta,
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
      // Without this every save is a duplicate, and `save()` maps duplicates to
      // success — so the answers vanish and the screen advances. That was S23.
      editToken,
      // Assembled from the STATED country code. `v.phone` keeps whatever was
      // typed so the field still shows it; only E.164 travels.
      profile: { ...v, phone: assemblePhone(dialCountry, v.phone).e164 || null, zip: null },
    });
  }

  /**
   * Hand the save to the background and return. The screen advances now.
   *
   * Measured on production: a warm step save is 4.9-7.1s, because the endpoint
   * awaits an Apps Script write. Every "Next" paid that. Nothing about the save
   * needs the person to wait for it — the answer is already in `v`, and the
   * payload is the full accumulated profile, so a save that lands late still
   * lands complete.
   *
   * Ordering is guaranteed by saveQueue's single-flight coalescing, not by this
   * function. See that file for why a race here would REVERT a correction
   * rather than merely delay it.
   */
  function save() {
    const fingerprint = JSON.stringify(payload());
    // Unchanged since the last queued save — Back-then-Continue stays free.
    if (fingerprint === lastSaved.current) return;
    lastSaved.current = fingerprint;
    setError("");
    queueSave(payload());
  }

  /**
   * The one place the person waits, and only at the end.
   *
   * A background save that fails with nobody awaiting it is S23 performed on
   * purpose: a confirmation screen saying the answers are saved while they are
   * not. So the last step blocks until everything queued has settled, and a
   * permanent failure stops the confirmation rather than decorating it.
   */
  async function finishWithSaves(done) {
    setBusy(true);
    // One id per submission, minted HERE — at the final submission and nowhere
    // else — so the same string reaches the request body and fbq. Generated
    // before the save so it can travel with it.
    // ⚠️ GATED ON THE PIXEL BEING CONFIGURED, NOT MERELY ON FIRING Lead.
    // Minting unconditionally put `event_id` in the request body of builds with
    // no pixel at all — and `.strict()` rejects on key presence, so that would
    // 400 EVERY submission on any deploy without the variable set. Caught by
    // the disabled-build check, which is the whole reason for running it.
    const eventId = isPixelEnabled() && !leadFired.current ? newEventId() : null;
    if (eventId) queueSave(payload({ event_id: eventId, ...getFbCookies() }));
    const settled = await settleSaves();
    setBusy(false);
    if (settled.ok) {
      // Only on a genuinely successful completion. Not on a 409, not on a
      // validation failure, not on a step-1-only save — none of which reach
      // here: a blocked submit returns from validateScreen(), and a failed
      // settle falls through to the error branch below.
      if (eventId && !leadFired.current) {
        leadFired.current = true;
        trackLead(eventId);
      }
      done();
      return;
    }
    setError(
      settled.status === RESULT.RATE_LIMITED
        ? "Give that a couple of seconds — your spot is already saved."
        : "Your spot is safe, but we couldn't save these answers. Try again?",
    );
  }

  /**
   * Every rule that can block a submit, in the order they appear on screen.
   *
   * ⚠️ THIS IS A REGISTRY, NOT A CONDITION, AND THAT IS THE POINT.
   * There was one check here and it failed silently: the message rendered
   * beside the field, the field was above the fold, and the button did nothing
   * visible. Anything added here now inherits focus, scroll, an announcement
   * and a message at the button, so the next rule cannot reintroduce the bug.
   *
   * `id` must match the Field id so the person can be moved to it.
   */
  function screenRules() {
    const id = SCREENS[screen].id;
    const rules = [];
    if (id === "extras") {
      // Ticked "text me" and gave nothing. buildPayload now silently drops the
      // consent in this state (S24: a consent with no datum is refused by the
      // server), so without this the opt-in disappears with no explanation.
      rules.push({
        id: `ph-${uid}`,
        set: setPhoneError,
        message: consentSms && !String(v.phone || "").trim()
          ? "Add your number, or untick the text option."
          : null,
      });
      rules.push({
        id: `ph-${uid}`,
        set: setPhoneError,
        // One source of truth for "is this a phone number": the same assembler
        // that builds what gets sent. A separate check here could disagree with
        // it, and the disagreement would only show up as a server rejection.
        message: consentSms && v.phone ? assemblePhone(dialCountry, v.phone).error : null,
      });
    }
    return rules;
  }

  /** Validate one field as the person leaves it, so they learn while looking. */
  function validateOnBlur() {
    const failed = screenRules().find((r) => r.message);
    if (failed) failed.set(failed.message);
  }

  /**
   * Returns true when the screen may advance. When it may not, the person is
   * moved to the blocking field, told at the button, and told aloud.
   */
  function validateScreen() {
    for (const r of screenRules()) r.set("");
    const failed = screenRules().find((r) => r.message);
    if (!failed) {
      setBlockedMsg("");
      return true;
    }
    failed.set(failed.message);
    setBlockedMsg(copy.blocked);
    const el = fieldEls.current[failed.id];
    if (el) {
      // Scroll BEFORE focus: focus alone jumps abruptly and, on iOS, can be
      // swallowed by the keyboard opening over the field it just moved to.
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      window.requestAnimationFrame(() => el.focus({ preventScroll: true }));
    }
    return false;
  }

  async function advance(e) {
    e.preventDefault();
    if (!validateScreen()) return;
    save();
    trackScreen(EVENTS.STEP2_SCREEN_ADVANCE, screen, { screen: SCREENS[screen].id, answered });
    if (screen + 1 < SCREENS.length) setScreen(screen + 1);
    else await finishWithSaves(onDone);
  }

  /** Leave the whole flow. Deliberately the quieter of the two exits. */
  async function finish() {
    trackOnce(EVENTS.STEP2_SKIP, { answered, screen: SCREENS[screen].id });
    // Leaving early still waits for whatever is in flight. Someone who answered
    // two screens and then exits must not lose them to a request we abandoned.
    await finishWithSaves(onSkip);
  }

  /**
   * Skip THIS screen only. The previous single control did what `finish` does,
   * from the position where a next-question skip belongs — so anyone who used
   * it never saw screens 3 or 4. Two exits, and the loud one advances.
   */
  async function skipScreen() {
    trackScreen(EVENTS.STEP2_SCREEN_SKIP, screen, { screen: SCREENS[screen].id, answered });
    // Still saves: a screen skipped after two were answered must not lose them.
    save();
    if (screen + 1 < SCREENS.length) setScreen(screen + 1);
    else await finishWithSaves(onDone);
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
    placeholder: def.otherPlaceholder,
    value: val,
    maxLength: otherMaxFor(def),
    onChange: (t) => set({ [key]: t }),
  });

  return (
    <div className="zw-card zw-card--tall">
      <Progress step={screen + 1} total={SCREENS.length} label={copy.savedNote} />

      <h2 className="zw-title" ref={headingRef} tabIndex={-1}>{s.title}</h2>
      {/* Guarded: screens 1 and 3 lost their `why` on 21 Aug and an unguarded
          <p> leaves an empty element with the body margin still applied — a
          gap that looks like a layout bug rather than a deleted sentence. */}
      {s.why ? <p className="zw-body">{s.why}</p> : null}

      <form onSubmit={advance} noValidate>
        {s.id === "product" && (
          <>
            {/* First, and deliberately: the lowest-effort question in the flow.
                Opening with an easy one lifts completion on everything after
                it. `optional` is not decoration — the privacy policy promises
                only email and consent are required. */}
            <Field
              id={`name-${uid}`} label={NAME.label} optional hint={NAME.hint}
            >
              {(props) => (
                <Input
                  {...props} type="text" autoComplete="given-name"
                  maxLength={NAME.maxLength} placeholder={NAME.placeholder}
                  value={v.name}
                  onChange={(e) => { set({ name: e.target.value }); onName?.(e.target.value); }}
                />
              )}
            </Field>
            <ChipRadioGroup
              legend={FLAVOR.label} name="flavor" options={FLAVOR.options} value={v.flavor}
              onChange={(x) => { set({ flavor: x }); if (x) note(FLAVOR.key, x); }}
            />
            <ChipRadioGroup
              legend={QUANTITY_BAND.label} name="quantity_band" options={QUANTITY_BAND.options}
              hint={QUANTITY_BAND.hint}
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
              other={otherProps(PRICE_BAND, v.price_band_other, "price_band_other")}
              onChange={(x) => {
                set({ price_band: x, ...(x === "other" ? {} : { price_band_other: "" }) });
                if (x) note(PRICE_BAND.key, x);
              }}
            />
          </>
        )}

        {s.id === "reach" && (
          <>
            <ChipMultiGroup
              legend={CHANNEL.label} options={CHANNEL.options} values={v.channel}
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
                else { setConsentHealth(false); set({ motivation: [], motivation_other: "", dietary: [], dietary_other: "" }); }
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
                    if (!on) set({ motivation: [], motivation_other: "", dietary: [], dietary_other: "" });
                  }}
                />
                <ChipMultiGroup
                  legend={MOTIVATION.label} options={MOTIVATION.options} values={v.motivation}
                  disabled={!consentHealth}
                  other={otherProps(MOTIVATION, v.motivation_other, "motivation_other")}
                  onChange={(x) => {
                    set({ motivation: x, ...(x.includes("other") ? {} : { motivation_other: "" }) });
                    if (x.length) note(MOTIVATION.key);
                  }}
                />
                <ChipMultiGroup
                  legend={DIETARY.label} options={DIETARY.options} values={v.dietary}
                  disabled={!consentHealth}
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
                <Field id={`ph-${uid}`} label={PHONE.label} optional error={phoneError} hint={PHONE.hint || undefined}>
                  {(props) => (
                    /* The dial code is a CONTROL, not a placeholder hint. The
                       requirement is stated by the interface instead of being
                       enforced after the press — which is how a real person
                       met a dead button and left. */
                    <div className="zw-phone-row">
                      <Select
                        aria-label="Country code"
                        className="zw-dial"
                        value={dialCountry}
                        disabled={!consentSms}
                        options={DIAL_CODES.map((c) => ({ value: c.code, label: `${c.code} +${c.dial}` }))}
                        onChange={(e) => {
                          setDialCountry(e.target.value);
                          if (phoneError) setPhoneError("");
                          if (blockedMsg) setBlockedMsg("");
                        }}
                      />
                      <Input
                        {...props} type="tel" inputMode="tel" autoComplete="tel"
                        maxLength={PHONE.maxLength} placeholder={PHONE.placeholder}
                        value={v.phone} disabled={!consentSms}
                        ref={registerField(`ph-${uid}`)}
                        onBlur={validateOnBlur}
                        onChange={(e) => { set({ phone: e.target.value }); if (phoneError) setPhoneError(""); if (blockedMsg) setBlockedMsg(""); }}
                      />
                    </div>
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
                    {/* aria-live so a screen-reader user learns the fields went
                        live, rather than discovering it by tabbing into them. */}
                    {!consentPostal ? (
                      <p className="zw-note" aria-live="polite">{copy.mailLocked}</p>
                    ) : null}
                    {ADDRESS.fields.map((f) => (
                      <Field key={f.key} id={`${f.key}-${uid}`} label={f.label} optional>
                        {(props) =>
                          f.select ? (
                            /* ui/Select renders from an `options` PROP and
                               ignores children. Passing <option> children gave
                               it an empty list — the control existed and had
                               nothing to open. Same shape as the `show` prop:
                               a contract assumed rather than read. */
                            <Select
                              {...props} autoComplete={f.autoComplete} value={v[f.key]}
                              options={COUNTRY_OPTIONS} placeholder="Select a country"
                              onChange={(e) => set({ [f.key]: e.target.value })}
                            />
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

        {/* Announced, and rendered where the press happened. role="alert" so a
            screen reader hears it even though the visual error is elsewhere. */}
        <p className="zw-error" role="alert" aria-live="assertive">{blockedMsg}</p>

        <div className="zw-actions">
          <Button type="submit" variant="primary" disabled={busy} busy={busy} busyLabel={copy.nextBusy}>
            {screen + 1 < SCREENS.length ? copy.next : copy.finish}
          </Button>
          {/* Skip THIS screen and move on. On the last screen there is nothing
              to skip TO, so it is hidden there and the exit below stands alone. */}
          {screen + 1 < SCREENS.length && (
          <Button type="button" variant="ghost" onClick={skipScreen} disabled={busy}>
            {copy.skipScreen}
          </Button>
          )}

          {/* ⚠️ type="button" IS LOAD-BEARING on both of these. ui/Button sets no
              default type, so HTML's default of "submit" applies — inside this
              <form> that made Back and Skip run advance() and go FORWARD. Back
              was reported; Skip had the same bug and was not. My deleted
              stand-in defaulted to type="button", so the swap changed the
              default silently, exactly like the `show` prop did.
              Ghost, not primary: a retreat never wears the CTA colour. */}
          {screen > 0 && (
            <Button type="button" variant="ghost" onClick={() => setScreen(screen - 1)} disabled={busy}>
              {copy.back}
            </Button>
          )}
          {/* The full exit, on UX's `quiet` weight — shipped for exactly this.
              Three controls need three weights: primary Continue, ghost skip
              that advances, quiet exit that leaves. On ghost the skip and the
              exit rendered the same colour, so the hierarchy was two weights
              pretending to be three and the loud control was the one that
              ends the flow.
              QUIET IS VISUAL ONLY: still a full 44px target, still clears
              4.5:1. If it looks too prominent, that is the correct amount of
              prominent — an exit nobody can find is a dark pattern. */}
          <Button type="button" variant="quiet" onClick={finish} disabled={busy} className="zw-exit">
            {copy.exit}
          </Button>
        </div>
      </form>
    </div>
  );
}
