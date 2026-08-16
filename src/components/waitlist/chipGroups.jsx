/**
 * Chip group behaviours for step 2.
 *
 * These are NOT primitives — they are growth's field logic (single-select,
 * multi-select with a hard cap) expressed on top of the UX agent's <Chip> and
 * <ChipGroup>, which own every visual state. The stand-in chips that used to
 * live in primitives.jsx are gone; nothing here sets a colour, a size or a
 * border.
 *
 * On the selected-state attribute
 * ───────────────────────────────
 * UX's chip CSS keys off `[aria-pressed="true"]` and `[data-selected="true"]`.
 * A single-select group needs radio semantics (`role="radio"` + `aria-checked`)
 * so a screen reader announces "1 of N" rather than a row of unrelated toggles,
 * and `aria-pressed` must NOT be present on a radio. `data-selected` is what
 * carries the styling in that case, which is exactly why UX provided it — so no
 * change to ui.css was needed here.
 */
import Chip, { ChipGroup } from '../ui/Chip.jsx';

/** Single-choice chips. Radio semantics, so a screen reader announces 1 of N. */
export function ChipRadioGroup({ legend, name, options, value, onChange, hint }) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <ChipGroup legend={legend} showLegend>
      {hint ? (
        <p className="zw-note" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="zw-chips" role="radiogroup" aria-label={legend} aria-describedby={hintId}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <Chip
              key={String(opt.value)}
              role="radio"
              aria-checked={selected}
              aria-pressed={undefined}
              data-selected={selected ? 'true' : undefined}
              onClick={() => onChange(selected ? null : opt.value)}
            >
              {opt.label}
            </Chip>
          );
        })}
      </div>
    </ChipGroup>
  );
}

/** Multi-choice chips with a hard cap. Over-cap chips disable rather than hide. */
export function ChipMultiGroup({ legend, options, values, onChange, max, hint, disabled }) {
  const atMax = max != null && values.length >= max;
  const hintId = hint ? `${legend.replace(/\s+/g, '-').toLowerCase()}-hint` : undefined;

  return (
    <ChipGroup legend={legend} showLegend>
      {hint ? (
        <p className="zw-note" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="zw-chips" aria-describedby={hintId}>
        {options.map((opt) => {
          const selected = values.includes(opt.value);
          return (
            <Chip
              key={opt.value}
              selected={selected}
              disabled={disabled || (atMax && !selected)}
              onClick={() =>
                onChange(selected ? values.filter((v) => v !== opt.value) : [...values, opt.value])
              }
            >
              {opt.label}
            </Chip>
          );
        })}
      </div>
    </ChipGroup>
  );
}
