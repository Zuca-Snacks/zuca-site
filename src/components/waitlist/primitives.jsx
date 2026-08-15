// ─── Minimum viable primitives ───────────────────────────────────────────────
// src/components/ui/ does not exist on this branch — the UI/UX agent owns it and
// ships it on `ux/mobile-redesign`. Per the brief, this is the minimum unstyled
// version, built on tokens only.
//
// These deliberately live in the waitlist folder rather than in src/components/ui/
// so that this branch cannot collide with the UX branch on merge. Swapping to the
// real primitives is an import change; the prop API each one needs is documented
// in HANDOFF-growth.md.

import { useId } from "react";

export function Button({ variant = "primary", busy = false, busyLabel, children, ...props }) {
  return (
    <button
      type="button"
      className={`zw-btn zw-btn--${variant}`}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export function Field({ label, hint, error, errorId, children }) {
  return (
    <div className="zw-field">
      {label}
      {children}
      {hint ? <p className="zw-note">{hint}</p> : null}
      {/* Always rendered so an error appearing cannot shift the layout, and so
          the live region exists before the message does. */}
      <span className="zw-error" id={errorId} role="alert" aria-live="assertive">
        {error || ""}
      </span>
    </div>
  );
}

export function Input({ label, id, error, errorId, ...props }) {
  const generated = useId();
  const inputId = id || generated;
  return (
    <>
      <label className="zw-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="zw-input"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
    </>
  );
}

/** Single-choice chips. Radio semantics, so a screen reader announces 1 of N. */
export function ChipRadioGroup({ legend, name, options, value, onChange, hint }) {
  return (
    <fieldset className="zw-field">
      <legend className="zw-legend">{legend}</legend>
      {hint ? <p className="zw-note" style={{ marginTop: 0 }}>{hint}</p> : null}
      <div className="zw-chips" role="radiogroup" aria-label={legend}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              name={name}
              className="zw-chip"
              onClick={() => onChange(selected ? null : opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Multi-choice chips with a hard cap. Over-cap chips disable rather than hide. */
export function ChipMultiGroup({ legend, options, values, onChange, max, hint, disabled }) {
  const atMax = max != null && values.length >= max;
  return (
    <fieldset className="zw-field" disabled={disabled}>
      <legend className="zw-legend">{legend}</legend>
      {hint ? <p className="zw-note" style={{ marginTop: 0 }}>{hint}</p> : null}
      <div className="zw-chips">
        {options.map((opt) => {
          const selected = values.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              className="zw-chip"
              disabled={disabled || (atMax && !selected)}
              onClick={() =>
                onChange(selected ? values.filter((v) => v !== opt.value) : [...values, opt.value])
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * A consent checkbox. Never pre-checked, never bundled with another consent,
 * and the label is always the full sentence — not "I agree to the terms".
 */
export function Consent({ id, checked, onChange, children, separate = false, describedBy }) {
  const generated = useId();
  const inputId = id || generated;
  return (
    <label className={`zw-consent${separate ? " zw-consent--separate" : ""}`} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={describedBy}
      />
      <span className="zw-consent-text">{children}</span>
    </label>
  );
}
