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
 *   maxLength  number   hard character cap (default 80)
 *
 * Added by UX, both defaulted so growth's existing call sites work untouched:
 *   show       boolean  whether the field is revealed (default false)
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
 * still in the form. The caller MUST clear `value` when "Other" is deselected,
 * or a stale answer is submitted for a chip the user turned off.
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
 * ⚠️ PRIVACY — READ BEFORE WIRING THIS TO `motivation`.
 * `motivation` is special-category health data under GDPR Art 9, which is why
 * it already sits behind its own consent line. An enum is bounded; a free-text
 * box is not, and next to a health question it invites people to type a
 * diagnosis. There is also NO field in the waitlist contract to send it in.
 * Both flagged in HANDOFF-ux.md. This primitive is safe to render; WHERE it is
 * rendered is a legal question, not a UI one.
 */
import { forwardRef } from 'react';

const OtherInput = forwardRef(function OtherInput(
  {
    id,
    label,
    value = '',
    onChange,
    maxLength = 80,
    show = false,
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

  if (!show && !reserveSpace) return null;

  return (
    <div
      className={`z-other ${className}`.trim()}
      data-show={show ? 'true' : 'false'}
      inert={!show}
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
