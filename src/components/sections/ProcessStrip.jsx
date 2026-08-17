import { useEffect, useRef, useState } from 'react';
/**
 * ProcessStrip — the five-step making-of, as pictures rather than paragraphs.
 *
 * Replaces the typography-only step list inside HowItsMade. Built as real HTML
 * and CSS with individual photographs, deliberately NOT as a flat export of the
 * deck slide: baked-in text is invisible to screen readers, cannot reflow at
 * 390px, and cannot be corrected without a round trip to a design tool.
 *
 * ⚠️ NO INPUT-COST FIGURES. The pulp disposal price is on the deck's process
 * slide and stays off the site — supplier-negotiation information that reads
 * "cheap" rather than "clever" to a consumer.
 *
 * PHOTOGRAPHY STATUS — degrades gracefully, by design.
 * FOUR of five steps carry a real Zuca photograph. Step 1 is a placeholder: the
 * available shot is pulp in a disposable foil catering pan and was withdrawn —
 * see the note on that step. Step 2 is a dehydrator tray, which reads as
 * equipment rather than catering, and stays.
 *
 * Steps 1 and 2 came from a composite strip, so their sources are only ~240px
 * against a ~325px slot. Camera originals are needed for both.
 *
 * Step 4 of Emil's strip was NOT used. Its panel is stock imagery rather than
 * Zuca's own, and one quadrant shows a grain that reads as oats. The current
 * step 4 uses Zuca's own freeze-dried raspberry instead.
 *
 * The placeholder plate is kept in the markup below for any future step that
 * has no photograph — it reads as "photo pending" rather than as a broken
 * image, and it never fakes a step with somebody else's process.
 *
 * Every photograph here was checked against the allergen TODO in copy.js before
 * being added. Only tree nuts are confirmed; gluten/oats, dairy and
 * shared-facility cross-contact are not. A photograph showing an unconfirmed
 * allergen asserts it in pixels exactly as copy would in words, which is why
 * the ingredients shot from the deck is NOT here — it shows rolled oats.
 */
/* 1x1 transparent GIF. Holds the box at its declared width/height until the
   real source is allowed to load, so gating costs no layout shift. */
const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const STEPS = [
  {
    n: 1,
    title: 'Collect the pulp',
    body: 'Pressing apples for juice leaves the fiber behind. We take it before it spoils.',
    /* ⚠️ The FOIL CATERING PAN shot that was here is withdrawn permanently —
       "no foil catering trays", because the FAQ asserts 21 CFR 117
       manufacturing four sections below. Do not restore it from the strip.
       This replacement is a working juice bar: commercial press, apples
       waiting, pulp collecting in a lined bin. It shows the supply chain,
       which is what the rule was protecting. */
    img: {
      slug: 'process-pulp-collect',
      widths: [296, 296],
      alt: 'A commercial juice press at a juice bar, apples waiting in a basket and pressed pulp collecting in a lined bin.',
    },
  },
  {
    n: 2,
    title: 'Dehydrate',
    body: 'Dried low and slow, so the fruit keeps its character instead of cooking off.',
    img: {
      slug: 'process-pulp-dried',
      widths: [240, 240],
      alt: 'Apple pulp after drying — brittle golden flakes in a steel tray.',
    },
  },
  {
    n: 3,
    title: 'Mill it fine',
    body: 'Milled to a flour. This is the fiber that does the work in every bite.',
    img: {
      slug: 'process-pulp-milled',
      alt: 'Finely milled apple pulp, a soft tan flour with a few larger clumps.',
    },
  },
  {
    n: 4,
    title: 'Add the flavor',
    body: 'Freeze-dried fruit, nuts and spice — the chef’s part of the job.',
    img: {
      slug: 'process-raspberry-powder',
      alt: 'Freeze-dried raspberry milled to a vivid crimson powder.',
    },
  },
  {
    n: 5,
    title: 'Roll into bites',
    body: 'Shaped, finished and rolled. Two flavors, same 10 grams of fiber.',
    img: {
      // Reuses the flavour crop, which is generated at 360/640 rather than the
      // 320/560 the process photos use — hence the per-step widths below.
      slug: 'flavor-chocolate-raspberry',
      widths: [360, 640],
      alt: 'Finished Zuca bites rolled in freeze-dried raspberry.',
    },
  },
];

export default function ProcessStrip() {
  /* Photographs load only once the strip nears the viewport.
     loading="lazy" is NOT enough on its own: Chrome's lazy threshold is very
     generous on a throttled connection, and all four of these (59.8 KB) were
     measured being fetched during the initial paint, competing with the LCP
     image. This is the same gate used for the decorative artwork, applied to
     <img> rather than to a CSS background — the alt text and the reserved
     width/height stay, so there is no CLS and nothing is hidden from a screen
     reader; only the bytes wait. */
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
      ([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } },
      { rootMargin: '300px 0px' }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <ol className="z-process-strip" ref={ref}>
      {STEPS.map((s) => (
        <li className="z-process-step" key={s.n}>
          <div className="z-process-step__media">
            {s.img ? (
              (() => {
                const [wSm, wLg] = s.img.widths ?? [320, 560];
                // Every tile now renders at the same width, including the
                // full-row final step, so one `sizes` is correct for all five.
                const sizes = '(min-width: 60em) 18vw, 44vw';
                const set = (ext) =>
                  `/images/${s.img.slug}-${wSm}.${ext} ${wSm}w, /images/${s.img.slug}-${wLg}.${ext} ${wLg}w`;
                return (
                  <picture>
                    {near && (
                      <>
                        <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
                        <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
                      </>
                    )}
                    <img
                      src={near ? `/images/${s.img.slug}-${wSm}.jpg` : BLANK}
                      width={wSm}
                      height={wSm}
                      alt={s.img.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                );
              })()
            ) : (
              /* Placeholder, not a broken image. aria-hidden because the step
                 number is already announced by the ordered list and the title
                 immediately below carries the meaning. */
              <div className="z-process-step__placeholder" aria-hidden="true">
                <span>{String(s.n).padStart(2, '0')}</span>
              </div>
            )}
            <span className="z-process-step__num" aria-hidden="true">
              {String(s.n).padStart(2, '0')}
            </span>
          </div>

          <h3 className="z-process-step__title">{s.title}</h3>
          <p className="z-process-step__body">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
