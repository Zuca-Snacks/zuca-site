/**
 * OtherInput — the free-text field that appears when "Other" is chosen in a
 * chip group.
 *
 * ⚠️ THE PROP SIGNATURE IS GROWTH'S, DELIBERATELY. It matches the stand-in in
 * their four-screen step 2 so adopting this is a swap of the import line and
 * nothing else:
 *
 *   id         string   required — the control's id
 *   label      node     required — a REAL, VISIBLE label
 *   value      string   controlled value
 *   onChange   fn       (value: string) => void
 *                       ⚠️ RECEIVES THE VALUE, NOT THE EVENT, and the value is
 *                       ALREADY TRUNCATED to maxLength. This differs from
 *                       <Input>, which forwards the event like a plain
 *                       <input>. Kept different on purpose: it is the shape
 *                       growth already codes against.
 *   maxLength  number   hard character cap (default 120)
 *                       ⚠️ 120 MATCHES THE SERVER. security's validator defines
 *                       every *_other field as safeString(120), so a tighter
 *                       client default would silently truncate answers the API
 *                       would have accepted, and a looser one would produce a
 *                       400 the user reads as "the form is broken".
 *
 * Added by UX, both defaulted so growth's existing call sites work untouched:
 *   show       boolean  whether the field is revealed. ⚠️ REQUIRED IN PRACTICE:
 *                       omitting it renders an invisible, inert field with no
 *                       visual tell. Dev builds warn; see the note in the body.
 *   hint       node     optional helper text
 *   error      node     optional error message
 *   announceFrom number characters remaining at which the counter starts being
 *                       ANNOUNCED — capped at a quarter of maxLength, so a
 *                       short field does not announce from the first keystroke.
 *                       Default 20. The counter is always rendered visibly.
 *
 * ⚠️ ZERO LAYOUT SHIFT, AND HERE IS WHAT IT COSTS. The field is ALWAYS in the
 * document and always occupies its box; `show` toggles visibility, not
 * presence. Revealing it therefore moves nothing — no CLS, and no Continue
 * button sliding out from under a thumb already on its way down. The price is a
 * reserved gap beneath the chip group while it is hidden. That is the trade,
 * made deliberately: a conditionally-INSERTED field is the classic cause of a
 * mis-tap on the control beneath it.
 * `reserveSpace={false}` reclaims the gap, and then it will shift the page.
 *
 * ⚠️ HIDDEN MEANS INERT, BUT NOT UNSUBMITTED. `inert` takes it out of the tab
 * order, the a11y tree and pointer events in one attribute — but the value is
 * still in the form. The caller MUST clear `value` when "Other" is deselected.
 * This is not a tidiness point: security's validator pairs every *_other field
 * with its parent in a superRefine, so an orphaned free-text value — one whose
 * chip is no longer selected — is REJECTED, and the user gets a failed submit
 * for a box they cannot see.
 *
 * ⚠️ THE CAP IS ENFORCED TWICE. `maxLength` stops typing and pasting; the slice
 * in the handler stops anything that sets the value another way, so `onChange`
 * can never hand the caller an over-length string. A free-text field that
 * reaches the API over-length is a 400, which the user experiences as "the form
 * is broken".
 *
 * ⚠️ THE COUNTER IS ANNOUNCED, not just drawn. Growth's stand-in rendered it
 * aria-hidden with no live region, so a screen-reader user got no warning
 * before the cap silently stopped accepting characters. It is visible from the
 * start and enters a polite live region only near the limit — a region that
 * updates on every keystroke is unusable with a screen reader running.
 *
 * ⚠️⚠️ NEVER WIRE THIS TO `motivation`. RULED BY EMIL, 18 Aug — not a
 * preference, not a flag, a prohibition.
 * `motivation` is special-category health data under GDPR Art 9. An enum is
 * bounded and minimisable; a free-text box beside a health question invites
 * people to type detailed medical information, which is far more sensitive than
 * picking from a list and much harder to justify or minimise. The health-
 * motivation question is CHIPS ONLY.
 * `motivation_other` is being deleted from the schema entirely.
 *
 * Where this primitive IS allowed:
 *   referral_source_other · channel_other — no health dimension, no restriction.
 *   dietary_other — allowed but CAPPED SHORT, with microcopy asking for
 *     allergen NAMES only, never medical detail. Pass an explicit short
 *     maxLength; do not rely on the 120 default, which exists to match the
 *     server rather than to be appropriate here.
 */
import { forwardRef } from 'react';

const OtherInput = forwardRef(function OtherInput(
  {
    id,
    label,
    value = '',
    onChange,
    maxLength = 120,
    show,
    hint,
    error,
    announceFrom = 20,
    reserveSpace = true,
    className = '',
    ...rest
  },
  ref
) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = `${id}-count`;
  const isShown = show === true;
  const remaining = maxLength - value.length;
  /* ⚠️ RELATIVE TO THE CAP, not a flat number. A flat 20 meant that with
     maxLength={20} the field announced from the very first character — the
     exact chatter the threshold exists to prevent. Caught by the harness at
     2/20. Whichever is tighter: the caller's number, or a quarter of the cap. */
  const threshold = Math.min(announceFrom, Math.ceil(maxLength * 0.25));
  const announce = remaining <= threshold;

  const describedBy =
    [hintId, errorId, countId].filter(Boolean).join(' ') || undefined;

  function handleChange(e) {
    if (onChange) onChange(e.target.value.slice(0, maxLength));
  }

  /* ⚠️ A CONSUMER THAT FORGETS `show` GETS A SILENTLY UNREACHABLE FIELD.
     This is the cost of the always-rendered design that makes the reveal
     shift-free: `show` defaults to false, so an omitted prop renders a field
     that is present, inert and invisible. It has NO visual tell, and lint,
     build and presence-based tests all stay green — growth shipped every
     free-text box in that state and it went unnoticed for a while.
     So the omission is made loud in development. Not a runtime guard: it costs
     nothing in production and never changes behaviour. */
  if (import.meta.env?.DEV && show === undefined) {
    console.warn(
      `<OtherInput id="${id}"> was rendered without a \`show\` prop, so it is ` +
        `invisible and inert. Pass show={isOtherSelected}. This is not a ` +
        `styling issue — the field cannot be reached at all.`
    );
  }

  if (!isShown && !reserveSpace) return null;

  return (
    <div
      className={`z-other ${className}`.trim()}
      data-show={isShown ? 'true' : 'false'}
      inert={!isShown}
    >
      <label className="z-other__label" htmlFor={id}>
        {label}
      </label>

      {hint && (
        <span className="z-other__hint" id={hintId}>
          {hint}
        </span>
      )}

      <input
        ref={ref}
        id={id}
        type="text"
        className="z-input z-other__input"
        value={value}
        onChange={handleChange}
        maxLength={maxLength}
        autoComplete="off"
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : undefined}
        {...rest}
      />

      {/* Visible from the first character; announced only near the cap.
          aria-live is set conditionally rather than the CONTENT being swapped
          in and out, so the element is already in the a11y tree when it starts
          speaking — a live region inserted at the same moment as its text is
          not reliably announced. */}
      <span
        className="z-other__count"
        id={countId}
        data-low={remaining <= Math.min(5, threshold) ? 'true' : 'false'}
        aria-live={announce ? 'polite' : 'off'}
      >
        {announce
          ? `${value.length}/${maxLength} — ${remaining} character${
              remaining === 1 ? '' : 's'
            } left`
          : `${value.length}/${maxLength}`}
      </span>

      <div className="z-other__live" aria-live="polite">
        {error && (
          <span className="z-other__error" id={errorId}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
});

export default OtherInput;
