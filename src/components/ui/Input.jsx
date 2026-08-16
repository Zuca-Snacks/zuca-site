/**
 * Input
 *
 * A styled text input. Pair it with <Field> for the label/hint/error slots.
 *
 * Props
 *   invalid   boolean   sets aria-invalid and the error border
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
  { invalid = false, className = '', ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={`z-input ${className}`.trim()}
      aria-invalid={invalid ? 'true' : rest['aria-invalid']}
      {...rest}
    />
  );
});

export default Input;
