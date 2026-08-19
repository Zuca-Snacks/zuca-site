/**
 * Select
 *
 * A styled native <select> — native is deliberate: it gives us the platform
 * picker on mobile, full keyboard support and zero JS.
 *
 * Props — supply the options EITHER way, whichever suits the call site:
 *   children  <option> elements, written out in JSX
 *   options   Array<{ value: string, label: string }>
 *   placeholder  string   optional leading option (value "")
 *   invalid   boolean
 *   ...rest   forwarded to <select> (value, onChange, id, required, …)
 *
 * ⚠️ CHILDREN USED TO BE SILENTLY DISCARDED. This component took `options` only
 * and rendered nothing else, so <Select><option>…</option></Select> — which is
 * the obvious way to write it, and what growth wrote — produced an EMPTY
 * dropdown. The country field shipped that way. Both forms now work, and
 * passing both at once warns rather than picking one behind your back.
 */
import { forwardRef } from 'react';
import { warnIgnored } from './devWarn.js';

const Select = forwardRef(function Select(
  { options, placeholder, invalid = false, children, className = '', ...rest },
  ref
) {
  warnIgnored(
    'Select',
    children != null && options != null,
    'was given BOTH `options` and children. Children win; the `options` prop ' +
      'is ignored. Pass one or the other.'
  );
  warnIgnored(
    'Select',
    children == null && options == null,
    'has no `options` prop and no children, so it renders an empty dropdown.'
  );

  return (
    <select
      ref={ref}
      className={`z-select ${className}`.trim()}
      aria-invalid={invalid ? 'true' : rest['aria-invalid']}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {children ??
        (options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
    </select>
  );
});

export default Select;
