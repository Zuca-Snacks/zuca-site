/**
 * ProofStrip — the traction facts, placed immediately after the hero so the
 * claim is backed before the scroll.
 *
 * ⚠️ NO PRE-ORDER / NO SALE LANGUAGE. Nobody has paid, no order exists and no
 * contract of sale has been formed, so nobody here may be described as having
 * pre-ordered or reserved anything. The same rule killed "sold out at a
 * physician symposium" — the samples ran out, they were not sold. Copy lives in
 * src/content/copy.js and every line there is a verifiable event.
 *
 * The waitlist size is NOT hardcoded. It reads live so it self-corrects when
 * test rows are removed from the sheet, rather than baking a number into copy
 * that then becomes a claim we have to defend. The row renders whether or not
 * the number arrives; only the numeral is late.
 */
import { proof } from '../../content/copy.js';
import useWaitlistCount from '../../hooks/useWaitlistCount.js';

export default function ProofStrip() {
  const count = useWaitlistCount();

  return (
    <section className="z-proof" aria-label="Traction so far">
      <div className="z-container">
        <ul className="z-proof__list">
          <li className="z-proof__item">
            {/* Non-breaking space, not an empty string, while the count is
                loading or unavailable. The figure then takes the identical
                layout path in both states, so this item stays aligned with the
                two static ones beside it and the strip does not resize when the
                number lands. Reserving a height in CSS instead meant guessing
                the display font's line box, and the guess was 6px out. */}
            <span className="z-proof__figure">
              {count != null && count > 0 ? count.toLocaleString() : ' '}
            </span>
            <span className="z-proof__label">{proof.liveLabel}</span>
          </li>
          {proof.items.map((p) => (
            <li className="z-proof__item" key={p.label}>
              <span className="z-proof__figure">{p.value}</span>
              <span className="z-proof__label">{p.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
