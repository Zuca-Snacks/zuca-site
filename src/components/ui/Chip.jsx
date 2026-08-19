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
 *   tone      'berry' | 'warm'  optional — the accent rule down the left edge.
 *             OMIT IT: consecutive groups alternate automatically, which is the
 *             point. Only pass it to force a specific one.
 *   children  node      the chips
 *
 * ⚠️ THE GROUP IS A PANEL, NOT A BARE FIELDSET (Emil, 18 Aug). Growth's step 2
 * read as a wall of identical outlined pills because question and answers
 * carried the same visual weight and were separated by one 8px flex gap. Three
 * things fix that and all three live here, so no consumer restyles anything:
 *   - the legend is a real question — a type step larger than the chips;
 *   - the group is a tinted panel with its own padding and a generous margin
 *     below, so one question visibly ends before the next begins;
 *   - an accent rule down the left edge, ALTERNATING red/amber between
 *     consecutive groups, so the column is not uniform.
 * The tint also makes the chips work harder: an unfilled chip is --z-surface,
 * which now contrasts with its container instead of floating on the page.
 *
 * ⚠️ The accent never uses --z-cta. Green means "advance" — a question is not
 * an action, and colouring one green would blunt the only signal the submit
 * button has.
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
  tone,
  children,
  className = '',
}) {
  return (
    <fieldset
      className={`z-chip-group ${className}`.trim()}
      data-tone={tone}
      data-panel={showLegend ? 'true' : undefined}
    >
      <legend
        className={showLegend ? 'z-chip-group__legend' : 'z-visually-hidden'}
      >
        {legend}
      </legend>
      {/* ⚠️ A wrapper INSIDE the fieldset, deliberately. A <legend> is rendered
          specially by the browser and does not behave as a normal flex or grid
          item, so the group's own layout cannot be trusted to space it. Putting
          everything except the legend in a normal <div> makes the spacing
          ordinary block layout, which behaves the same everywhere. */}
      <div className="z-chip-group__body">{children}</div>
    </fieldset>
  );
}

export default Chip;
