/**
 * Select
 *
 * A styled native <select> — native is deliberate: it gives us the platform
 * picker on mobile, full keyboard support and zero JS.
 *
 * Props
 *   options   Array<{ value: string, label: string }>  required
 *   placeholder  string   optional leading disabled-ish option (value "")
 *   invalid   boolean
 *   ...rest   forwarded to <select> (value, onChange, id, required, …)
 */
import { forwardRef } from 'react';

const Select = forwardRef(function Select(
  { options = [], placeholder, invalid = false, className = '', ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      className={`z-select ${className}`.trim()}
      aria-invalid={invalid ? 'true' : rest['aria-invalid']}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
});

export default Select;
