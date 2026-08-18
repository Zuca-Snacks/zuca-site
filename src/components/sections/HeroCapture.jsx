/**
 * HeroCapture — everything the comp's first screen does NOT contain, placed
 * immediately below the fold.
 *
 * The hero is now a literal build of hero-comp.png, which draws no h1, no
 * credential tagline and no email field. None of those were deleted; they live
 * here, one scroll down, and the hero's JOIN THE WAITLIST button scrolls to
 * this block and focuses the field.
 *
 * The <h1> lives here rather than in the hero because the page still needs
 * exactly one, and the comp does not draw one. Semantics do not care where it
 * sits; the comp does.
 *
 * The email field is NOT here — it moved onto the first screen, into the comp's
 * empty band between JOIN THE WAITLIST and SUPPORTED BY. This section carries
 * only what the comp does not draw.
 */
import { hero as copy, proof } from '../../content/copy.js';
import useWaitlistCount from '../../hooks/useWaitlistCount.js';
import TasterQuotes from './TasterQuotes.jsx';

export default function HeroCapture() {
  const count = useWaitlistCount();
  const hasCount = count != null && count > 0;

  return (
    <section className="z-capture z-section" id="capture" tabIndex={-1}>
      <div className="z-container z-capture__inner">
        {/* Was introLines[0], the credential line. Replaced by taster quotes
            (Emil, 17 Aug). The credential claim itself is not lost — it is
            still made once, in the hero. */}
        <TasterQuotes slot="lede" />

        {/* ⚠️ THE PAGE'S ONLY <h1>, and it stays exactly as written. */}
        <h1 className="z-capture__title">{copy.headline}</h1>

        <TasterQuotes slot="coda" />

        {/* Reserves its height so an arriving number cannot shift anything.
            ⚠️ The empty state must never be blank. It no longer falls back to
            copy.subhead — that was the "Two flavors, no added sugar…" line the
            quotes replaced — so it uses copy.countFallback, which is growth's
            purpose-made string for exactly this state. Until the count endpoint
            has its env vars, THIS is the state that ships, so it is the line
            most visitors will actually read. */}
        <div className="z-capture__count" data-has-count={hasCount ? 'true' : 'false'}>
          {hasCount ? (
            <>
              <span className="z-capture__count-num">{count.toLocaleString()}</span>
              <span className="z-capture__count-word">{proof.liveLabel}</span>
            </>
          ) : (
            <p className="z-capture__count-fallback">{copy.countFallback}</p>
          )}
        </div>
      </div>
    </section>
  );
}
