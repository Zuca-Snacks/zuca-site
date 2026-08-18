import { useEffect, useRef, useState } from 'react';

/**
 * Returns [ref, near] — `near` flips true once the referenced element comes
 * within `rootMargin` of the viewport, and never flips back.
 *
 * ⚠️ WHY THIS EXISTS WHEN loading="lazy" ALREADY DOES: Chrome's lazy-load
 * threshold is deliberately generous, and on a throttled mobile connection it
 * is generous enough to fetch below-fold images DURING the initial paint, where
 * they compete with the LCP element for bandwidth. Measured twice now — the
 * process photographs (59.8 KB) and the nutshell blocks (30.4 KB) were both
 * observed on the initial-load trace with loading="lazy" set.
 *
 * Gating the SOURCE, not the element: width/height, alt and the surrounding
 * markup all render immediately, so there is no layout shift and nothing is
 * hidden from a screen reader. Only the bytes wait.
 *
 * Without IntersectionObserver, everything loads — degrade to more bytes, never
 * to a missing image.
 */
export default function useNearViewport(rootMargin = '300px 0px') {
  const ref = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (!('IntersectionObserver' in window)) {
      // Deferred a tick so this is not a synchronous setState inside the
      // effect body, which cascades a render.
      const t = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [rootMargin]);

  return [ref, near];
}

/* 1x1 transparent GIF. Holds an <img> box at its declared width/height until
   the real source is allowed to load, so gating costs no layout shift. */
export const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
