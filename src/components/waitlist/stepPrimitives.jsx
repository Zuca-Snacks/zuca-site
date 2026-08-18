// ─── TEMPORARY — two primitives UX has not shipped yet ───────────────────────
// Everything else in the old primitives.jsx is gone: Button, Input, Field,
// Checkbox and the chip groups all come from src/components/ui/ and
// ./chipGroups.jsx now.
//
// These two remain only because `OtherInput` and `Progress` do not exist on any
// branch yet. UX is building both to exactly these signatures:
//     OtherInput({ id, label, value, onChange, maxLength })
//     Progress({ step, total, label })
// When they land: change the one import in Step2Profile.jsx and delete this
// file. It is deliberately the smallest possible surface so that swap is a
// one-line change rather than a port.

import { useId } from "react";

/**
 * Progress. Real numbers, not a decorative bar — someone deciding whether to
 * keep going is asking "how much more of this is there", and a bar with no
 * count answers a different question.
 */
export function Progress({ step, total, label }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="zw-progress">
      <div className="zw-progress-head">
        <span className="zw-progress-step">{`${step} of ${total}`}</span>
        {label ? <span className="zw-progress-label">{label}</span> : null}
      </div>
      <div
        className="zw-progress-track"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Step ${step} of ${total}`}
      >
        <span className="zw-progress-fill" style={{ inlineSize: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The free-text box revealed by an "Other" chip. Always capped, always
 * optional — an "Other" that selects but cannot be explained collects a shrug.
 */
export function OtherInput({ id, label, value, onChange, maxLength }) {
  const generated = useId();
  const inputId = id || generated;
  return (
    <div className="zw-other">
      <label className="zw-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="zw-input"
        type="text"
        maxLength={maxLength}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
      />
      <span className="zw-count" aria-hidden="true">{`${value.length}/${maxLength}`}</span>
    </div>
  );
}

