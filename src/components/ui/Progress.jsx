/**
 * Progress — the "1 of 4" step indicator for the multi-screen waitlist form.
 *
 * ⚠️ THE PROP SIGNATURE IS GROWTH'S, DELIBERATELY, so adopting this is a swap
 * of the import line and nothing else:
 *
 *   step   number   required — current step, 1-based
 *   total  number   required — total steps
 *   label  string   optional — the current step's name, e.g. "Your profile"
 *
 * ⚠️ role="progressbar" IS NOT ENOUGH ON ITS OWN, which is the one place this
 * departs from growth's stand-in internally. A progressbar's aria-valuenow
 * changing is NOT reliably announced — NVDA and VoiceOver generally stay silent
 * unless focus is inside it, and in a four-screen form focus is on the fields,
 * not the indicator. A blind user would move from screen 2 to screen 3 with no
 * signal that anything had changed.
 *
 * So the announcement is carried by a polite live region containing real text,
 * and everything drawn is aria-hidden. That gives EXACTLY ONE representation in
 * the accessibility tree — no double-speak from a progressbar and a live region
 * describing the same thing — and it announces on every step change.
 * The consumer contract is unchanged; only the internals differ.
 *
 * The bar is segmented rather than a continuous fill: four screens is a countable
 * number, and a discrete "3 of 4" is easier to read at a glance than a bar that
 * happens to be 75% full. Progress is shown three ways — position, count and
 * label — never by colour alone.
 */
export default function Progress({ step, total, label, className = '' }) {
  /* Clamped so a caller that runs off the end cannot render a negative bar or
     announce "step 5 of 4". */
  const current = Math.min(Math.max(1, step), total);

  const announcement = label
    ? `Step ${current} of ${total}: ${label}`
    : `Step ${current} of ${total}`;

  return (
    <div className={`z-progress ${className}`.trim()}>
      {/* Everything visible is aria-hidden: it duplicates the live region
          below, and announcing it twice is worse than not announcing it. */}
      <div className="z-progress__bar" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            className="z-progress__seg"
            key={i}
            data-state={i < current ? 'done' : 'todo'}
          />
        ))}
      </div>

      <p className="z-progress__text" aria-hidden="true">
        <span className="z-progress__count">
          {current} of {total}
        </span>
        {label && <span className="z-progress__label">{label}</span>}
      </p>

      {/* The single accessible representation. Present on first render so the
          region exists before its text changes — a live region created at the
          same moment as its content is not reliably announced. */}
      <p className="z-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
