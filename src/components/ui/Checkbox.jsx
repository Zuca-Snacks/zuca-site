/**
 * Checkbox — and the consent-block layout the waitlist form needs.
 *
 * Added for the GDPR Art 7(1) contract amendment (consent evidence is a hard
 * requirement). The conversion agent owns the wording, the POST and the
 * versioning; this file owns how it lays out and every visual state.
 *
 * Props
 *   id            string   required
 *   label         node     required — the consent sentence itself. Rendered in
 *                          a real <label>, so tapping it toggles the box.
 *   legal         node     optional smaller print BELOW the label. Put links
 *                          (privacy policy, terms) here, NOT in `label` — a
 *                          link inside a <label> toggles the checkbox when
 *                          clicked, which is a genuine usability trap.
 *   error         node     optional; announced via aria-live, sets aria-invalid
 *   consentVersion string  optional; stamped on the wrapper as
 *                          data-consent-version. See the note below.
 *   checked / onChange / disabled / required / ...rest → forwarded to <input>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * consent_text_version — WHY THE ATTRIBUTE IS HERE
 * The contract now requires recording *which wording* the user agreed to. That
 * only holds up as evidence if the version travels with the words themselves —
 * if the copy is edited and the version isn't bumped, the record silently
 * becomes wrong, and a stale-but-plausible consent record is worse than none.
 * Passing `consentVersion` alongside `label` keeps them adjacent in one call,
 * and `data-consent-version` makes the rendered value inspectable in DevTools
 * and in a screenshot of the live page.
 *
 * ⚠️ Conversion agent: bump the version whenever the label or legal text
 * changes, in the same commit. Do not default it.
 * ⚠️ consent_timestamp and country are SERVER-set. Never send them from here,
 * and never ask the user for a country — it is derived from the request IP.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { forwardRef } from 'react';

const Checkbox = forwardRef(function Checkbox(
  {
    id,
    label,
    legal,
    error,
    consentVersion,
    className = '',
    ...rest
  },
  ref
) {
  const legalId = legal ? `${id}-legal` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [legalId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div
      className={`z-checkbox-field ${className}`.trim()}
      data-consent-version={consentVersion}
    >
      {/* The <label> wraps the whole row so box, text and the space around them
          are one 44px+ target. `legal` stays OUTSIDE it, so the privacy link
          never toggles the box. */}
      <label className="z-checkbox-row" htmlFor={id}>
        <input
          ref={ref}
          type="checkbox"
          className="z-checkbox"
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          {...rest}
        />
        <span className="z-checkbox-label">{label}</span>
      </label>

      {legal && (
        <p className="z-checkbox-legal" id={legalId}>
          {legal}
        </p>
      )}

      {/* Mounted even when empty so the region exists before the error does. */}
      <div className="z-field__live" aria-live="polite">
        {error && (
          <span className="z-field__error" id={errorId}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
});

export default Checkbox;
