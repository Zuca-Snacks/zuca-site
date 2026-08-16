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
 * ALL FIVE steps now carry a real Zuca photograph. Steps 1 and 2 came from the
 * process strip Emil sent; they are extracted from a composite, so their
 * sources are only ~240px and are served at that size without enlargement.
 * Camera originals would let them match the density of the rest of the strip.
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
const STEPS = [
  {
    n: 1,
    title: 'Collect the pulp',
    body: 'Pressing apples for juice leaves the fiber behind. We take it before it spoils.',
    img: {
      slug: 'process-pulp-wet',
      widths: [240, 240],
      cutout: true,
      alt: 'Freshly collected apple pulp, a dense russet mash in a shallow tray.',
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
    wide: true,
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
  return (
    <ol className="z-process-strip">
      {STEPS.map((s) => (
        <li className="z-process-step" key={s.n}>
          <div
            className={`z-process-step__media${s.img?.cutout ? ' z-process-step__media--cutout' : ''}`}
          >
            {s.img ? (
              (() => {
                const [wSm, wLg] = s.img.widths ?? [320, 560];
                // Step 5 spans the whole last row on phones (see the
                // :last-child rules), so it renders ~55vw while the others
                // render ~44vw. Declaring one `sizes` for both made the browser
                // pick a source too small for the wide slot and upscale it.
                const sizes = s.wide
                  ? '(min-width: 60em) 18vw, 56vw'
                  : '(min-width: 60em) 18vw, 44vw';
                const set = (ext) =>
                  `/images/${s.img.slug}-${wSm}.${ext} ${wSm}w, /images/${s.img.slug}-${wLg}.${ext} ${wLg}w`;
                return (
                  <picture>
                    <source
                      type="image/avif"
                      srcSet={set('avif')}
                      sizes={sizes}
                    />
                    <source
                      type="image/webp"
                      srcSet={set('webp')}
                      sizes={sizes}
                    />
                    <img
                      src={`/images/${s.img.slug}-${wSm}.jpg`}
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
