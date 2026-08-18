/**
 * useReveal — marks sections `.is-in` once they approach the viewport.
 *
 * Does two jobs, and the second is the load-bearing one:
 *
 * 1. Drives the section entrance animation (CSS gates that on
 *    prefers-reduced-motion, not this file).
 *
 * 2. GATES DECORATIVE ARTWORK. Section background illustrations only get their
 *    background-image once `.is-in` is set. Browsers fetch CSS background
 *    images for off-screen elements eagerly — measured, all three section
 *    artworks were requested ~185ms into load, competing with the LCP image and
 *    costing 0.2s. Nothing decorative may touch LCP, so nothing decorative
 *    loads until it is nearly on screen.
 *
 * Because of (2) this observer must run even under prefers-reduced-motion —
 * otherwise those sections would never get their artwork at all. An earlier
 * version returned early under reduced motion, which would have silently
 * removed the backgrounds for those users.
 *
 * Deliberately tiny: one IntersectionObserver for the page, unobserving each
 * element after it fires. No animation library, no scroll listener.
 */
import { useEffect } from 'react';

const SELECTOR = '.z-reveal, .z-has-art';

export default function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(SELECTOR);
    if (!els.length) return;

    // No IntersectionObserver: show everything and load the artwork now.
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        }
      },
      // Generous margin so artwork has started loading by the time it is
      // scrolled to, without it being in flight during the initial paint.
      { rootMargin: '200px 0px', threshold: 0 }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
