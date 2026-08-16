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
 * unreachable. Every consumer must render its surrounding row unconditionally
 * and let only the numeral arrive late, or a slow count shifts the layout.
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
