/**
 * Chip / toggle-pill, and ChipGroup for multi-select.
 *
 * Built for the conversion agent's "why do you want Zuca?" question, which is
 * a max-3 multi-select over the `motivation` enum in the waitlist contract.
 *
 * Chip props
 *   selected  boolean   toggles aria-pressed and the filled style
 *   disabled  boolean
 *   children  node      the visible label
 *   ...rest   forwarded to <button> (onClick, value, …)
 *
 * ChipGroup props
 *   legend    string    required — a real <legend>, visually hidden by default
 *   showLegend boolean  render the legend visibly instead
 *   children  node      the chips
 *
 * Notes
 *   - Each chip is a real <button type="button"> with aria-pressed, so it is
 *     keyboard operable and announced as a toggle.
 *   - Selection is shown with fill + border + a ✓ glyph, never colour alone.
 *   - Caller owns the selection state and any max-N enforcement; pass
 *     disabled on the unselected chips once the cap is reached.
 */
export function Chip({
  selected = false,
  disabled = false,
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      type="button"
      className={`z-chip ${className}`.trim()}
      aria-pressed={selected}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ChipGroup({
  legend,
  showLegend = false,
  children,
  className = '',
}) {
  return (
    <fieldset className={`z-chip-group ${className}`.trim()}>
      <legend className={showLegend ? 'z-field__label' : 'z-visually-hidden'}>
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

export default Chip;
