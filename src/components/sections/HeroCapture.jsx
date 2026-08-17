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
import { hero as copy, introLines, proof } from '../../content/copy.js';
import useWaitlistCount from '../../hooks/useWaitlistCount.js';

export default function HeroCapture() {
  const count = useWaitlistCount();
  const hasCount = count != null && count > 0;

  return (
    <section className="z-capture z-section" id="capture" tabIndex={-1}>
      <div className="z-container z-capture__inner">
        <p className="z-capture__tagline">{introLines[0].replace(/,$/, '')}</p>

        <h1 className="z-capture__title">{copy.headline}</h1>

        {/* Reserves its height so an arriving number cannot shift the button
            above it; renders a static line rather than a blank when absent. */}
        <div className="z-capture__count" data-has-count={hasCount ? 'true' : 'false'}>
          {hasCount ? (
            <>
              <span className="z-capture__count-num">{count.toLocaleString()}</span>
              <span className="z-capture__count-word">{proof.liveLabel}</span>
            </>
          ) : (
            <p className="z-capture__count-fallback">
              {copy.countFallback ?? copy.subhead}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
