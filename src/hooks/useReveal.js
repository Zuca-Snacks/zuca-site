/**
 * useReveal — adds `.is-in` to elements carrying `.z-reveal` when they scroll
 * into view, driving the one entrance animation the site uses.
 *
 * Deliberately tiny: one IntersectionObserver for the whole page, unobserving
 * each element after it fires. No animation library, no scroll listener.
 *
 * Respects prefers-reduced-motion by simply not running — the CSS already
 * renders .z-reveal fully visible under that query, so nothing is hidden.
 */
import { useEffect } from 'react';

export default function useReveal() {
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReduced) return;

    const els = document.querySelectorAll('.z-reveal');
    if (!els.length) return;

    // No IntersectionObserver (very old browser): show everything immediately.
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
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
