/**
 * useWaitlistCount — the live waitlist size, fetched once per page view.
 *
 * WHY THIS EXISTS
 * The size is deliberately NOT hardcoded anywhere (growth's rule, see the proof
 * strip note in src/content/copy.js): a baked-in number is a claim we have to
 * defend, and it goes stale the moment test rows are cleaned out of the sheet.
 * Four places on the page want the same number — the hero microcopy, the proof
 * strip, the waitlist section lede and the sticky bar — and each one fetching
 * independently would mean four requests and four different numbers mid-flight.
 *
 * Returns `null` until it lands, and stays `null` if the endpoint is
 * unreachable — which is the state that ships until SHEETS_WEBHOOK_URL is set,
 * so it is the state to design for first, not the fallback.
 *
 * ─── HOW TO RENDER A VALUE THAT ARRIVES LATE ────────────────────────────────
 * Two states must agree: absent and present. Three ways to make them agree, in
 * order of preference — all three are in use, and the choice follows the
 * surroundings, not taste.
 *
 *   1. RENDER NOTHING AT ALL. Best when the element stands alone, because its
 *      absence leaves nothing to misalign. The hero count badge is not rendered
 *      when the count is null and is positioned out of flow when it is, so an
 *      absent count leaves no reserved hole and an arriving one displaces
 *      nothing. See Hero.jsx.
 *
 *   2. RENDER A PLACEHOLDER GLYPH. Best when the element sits in a row with
 *      others, where collapsing to zero height pulls its neighbours out of
 *      line. The proof strip renders U+00A0 in place of the numeral, so both
 *      states take the identical layout path. See ProofStrip.jsx.
 *
 *   3. DON'T RENDER IT HERE. If the value is already stated elsewhere on the
 *      page, a fourth repetition is not worth a shift. The waitlist lede used
 *      to append the count as a second sentence and grew 38px when it wrapped;
 *      it now says nothing about the count at all.
 *
 * ⚠️ NOT ON THE LIST: reserving a height in CSS. It has to guess a metric the
 * font decides, and it will be wrong in one direction or the other —
 * `min-height: 1lh` on the proof figure guessed 6px too tall and made the strip
 * SHRINK when the number arrived, which is the same bug pointing backwards.
 * Don't reserve what you can avoid needing to reserve.
 *
 * Whichever you pick, measure both states. `document.scrollHeight` empty vs
 * populated at 360/390/430 is the check that catches this.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react';
import { fetchCount } from '../components/waitlist/api.js';

let cached = null;
let inFlight = null;
const listeners = new Set();

function load() {
  if (cached !== null) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = fetchCount()
      .then((count) => {
        if (typeof count === 'number') {
          cached = count;
          for (const fn of listeners) fn(cached);
        }
        return cached;
      })
      .catch(() => null);
  }
  return inFlight;
}

export default function useWaitlistCount() {
  const [count, setCount] = useState(cached);

  useEffect(() => {
    listeners.add(setCount);
    load();
    return () => listeners.delete(setCount);
  }, []);

  return count;
}
