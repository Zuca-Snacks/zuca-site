/**
 * Field — label + hint + error wrapper.
 *
 * Wraps a single form control and wires up the accessibility plumbing so the
 * control itself only needs an id.
 *
 * Props
 *   id        string    required — must match the control's id
 *   label     node      required — rendered as a real <label>
 *   hint      node      optional helper text, linked via aria-describedby
 *   error     node      optional error message, linked via aria-describedby
 *   optional  boolean   appends a muted "optional" to the label
 *   children  function | node
 *             If a function, it is called with the ids/ARIA props to spread
 *             onto the control: ({ id, 'aria-describedby', 'aria-invalid' }).
 *             If a node, it is rendered as-is.
 *
 * The error is rendered inside an aria-live="polite" region so it is announced
 * when it appears without stealing focus.
 */
export default function Field({
  id,
  label,
  hint,
  error,
  optional = false,
  children,
  className = '',
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const controlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? 'true' : undefined,
  };

  return (
    <div className={`z-field ${className}`.trim()}>
      <label className="z-field__label" htmlFor={id}>
        {label}
        {optional && <span className="z-field__optional"> · optional</span>}
      </label>

      {hint && (
        <span className="z-field__hint" id={hintId}>
          {hint}
        </span>
      )}

      {typeof children === 'function' ? children(controlProps) : children}

      {/* Always present so the live region exists before the error does — a
          region inserted at the same time as its content is not reliably
          announced. While empty it is collapsed in CSS rather than hidden, so
          it stays in the a11y tree and contributes no layout spacing. */}
      <div className="z-field__live" aria-live="polite">
        {error && (
          <span className="z-field__error" id={errorId}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
