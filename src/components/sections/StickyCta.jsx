/**
 * StickyCta — persistent bottom bar on mobile.
 *
 * Rules it obeys:
 *   - Appears only once the hero (and its email field) has scrolled out of view.
 *   - Hides whenever the #waitlist section is on screen, so it never covers the
 *     form it is pointing at.
 *   - Hides while the on-screen keyboard is open, detected via visualViewport:
 *     when the visual viewport is much shorter than the layout viewport, a
 *     keyboard is up and a fixed bar would sit on top of the field being typed in.
 *   - Sits above the iOS home indicator via env(safe-area-inset-bottom) in CSS.
 *   - Slides with a transform only, and the transition is removed entirely under
 *     prefers-reduced-motion.
 *   - Hidden from the a11y tree and from tab order while off-screen, so keyboard
 *     users never land on an invisible button.
 *
 * Desktop hides the bar in CSS — the CTA is already in view there.
 */
import { useEffect, useState } from 'react';
import Button from '../ui/Button.jsx';

export default function StickyCta() {
  const [pastHero, setPastHero] = useState(false);
  const [waitlistInView, setWaitlistInView] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('top');
    const waitlist = document.getElementById('waitlist');
    if (!('IntersectionObserver' in window)) return;

    const observers = [];

    if (hero) {
      const io = new IntersectionObserver(
        ([e]) => setPastHero(!e.isIntersecting),
        { threshold: 0 }
      );
      io.observe(hero);
      observers.push(io);
    }

    if (waitlist) {
      const io = new IntersectionObserver(
        ([e]) => setWaitlistInView(e.isIntersecting),
        { threshold: 0 }
      );
      io.observe(waitlist);
      observers.push(io);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      // A keyboard typically eats >20% of the viewport height.
      setKeyboardOpen(vv.height < window.innerHeight * 0.8);
    };

    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  const visible = pastHero && !waitlistInView && !keyboardOpen;

  return (
    <div
      className="z-sticky-cta"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={visible ? undefined : 'true'}
    >
      <div className="z-sticky-cta__row">
        <p className="z-sticky-cta__text">
          <strong>10g fiber per bite</strong>
          130+ already on the list
        </p>
        <Button
          as="a"
          href="#waitlist"
          tabIndex={visible ? undefined : -1}
        >
          Join
        </Button>
      </div>
    </div>
  );
}
