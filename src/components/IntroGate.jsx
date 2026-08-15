/**
 * IntroGate — THE ORIGINAL CLICK-TO-ENTER INTRO. NOT RENDERED BY DEFAULT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS PARKED HERE
 * The old site opened on a full-screen gate: a typewriter tagline over ~6s and
 * a "click the logo to enter" prompt that had to be tapped before any product
 * content, CTA or email field existed in the DOM. On cold mobile traffic that
 * is a hard bounce risk, and it is incompatible with the requirement that the
 * email field be reachable without scrolling. It was removed from the render
 * tree — deliberately kept in the codebase rather than deleted, so it can be
 * restored or A/B tested.
 *
 * The brand moment it carried now lives in Hero.jsx as a <800ms, non-blocking
 * wordmark entrance that any scroll, tap or keypress finishes instantly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION: REMOVED FOR EVERYONE — ONE BEHAVIOUR, NO BRANCHING.
 * Emil's call: the gate is not conditionally skipped for any traffic source,
 * not bucketed, and not A/B tested. There is exactly one experience. Do NOT
 * reintroduce query-param, UTM or bucketing branches to show this component —
 * the point of removing it was to delete a code path, not to hide one.
 * This file is kept as an archived reference only.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IF IT IS EVER DELIBERATELY RESTORED (a new decision, not a toggle)
 *
 * 1. In src/App.jsx, import it and add gate state:
 *
 *      import IntroGate from './components/IntroGate.jsx';
 *      const [entered, setEntered] = useState(false);
 *
 * 2. Render it above the page content, hiding the page until entry:
 *
 *      {!entered && <IntroGate onEnter={() => setEntered(true)} />}
 *
 * 3. Add the stylesheet:  the gate's styles were part of the old inline
 *    <style> block and are NOT in the current token-based CSS — they would
 *    need to be rewritten against the design tokens.
 *
 * ⚠️ Restoring it re-introduces the LCP and bounce problems above, and the
 * original relied on `cursor:none` plus a mouse-follower ring that does nothing
 * on touch. Re-test on a phone before shipping it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react';

const LINES = [
  'A Michelin-trained chef and a Stanford physician,',
  'building a snack worth eating.',
];

export default function IntroGate({ onEnter }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setVisibleLines(1), 700),
      setTimeout(() => setVisibleLines(2), 2200),
      setTimeout(() => setPrompt(true), 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="z-gate">
      <button className="z-gate__logo" onClick={onEnter} type="button">
        ZUCA
      </button>

      <div className="z-gate__lines">
        {LINES.slice(0, visibleLines).map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>

      {prompt && (
        <button className="z-gate__prompt" onClick={onEnter} type="button">
          Enter
        </button>
      )}
    </div>
  );
}
