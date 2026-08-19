/**
 * Input
 *
 * A styled text input. Pair it with <Field> for the label/hint/error slots.
 *
 * Props
 *   invalid   boolean   sets aria-invalid and the error border
 *   prefix    node      a non-interactive adornment before the value — "$", "kr"
 *   suffix    node      the same, after it — "kg", "%"
 *
 * ⚠️ AN AFFIX IS DECORATION, NOT INFORMATION. It is aria-hidden, because a
 * screen reader announcing "dollar edit blank" tells the user nothing about
 * what to type. The unit belongs in the LABEL or the hint, where it is
 * announced with the field: `label="What would you pay? (USD)"`. If you add a
 * prefix and do not put the unit in the label, a blind user has no idea the
 * field is in dollars.
 *   ...rest   forwarded to <input> (type, value, onChange, autoComplete,
 *             inputMode, placeholder, required, disabled, id, aria-*, …)
 *
 * Notes
 *   - font-size is clamped to >=16px in CSS so iOS never zooms on focus.
 *   - Callers should set inputMode="email" autoComplete="email" for the
 *     waitlist email field.
 */
import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  { invalid = false, prefix, suffix, className = '', ...rest },
  ref
) {
  const field = (
    <input
      ref={ref}
      className={`z-input ${className}`.trim()}
      aria-invalid={invalid ? 'true' : rest['aria-invalid']}
      {...rest}
    />
  );

  if (!prefix && !suffix) return field;

  return (
    <span className="z-input-affix">
      {prefix != null && (
        <span className="z-input-affix__affix" data-side="prefix" aria-hidden="true">
          {prefix}
        </span>
      )}
      {field}
      {suffix != null && (
        <span className="z-input-affix__affix" data-side="suffix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </span>
  );
});

export default Input;
