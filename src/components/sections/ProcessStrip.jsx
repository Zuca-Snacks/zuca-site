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
 * Steps carrying a real photograph today: milled pulp, raspberry powder, and
 * the finished bites. The remaining two have no usable source, so they render
 * as a numbered typographic tile. That is a deliberate placeholder: it reads as
 * "photo pending", not as a broken image, and it does not fake a step with
 * stock imagery of somebody else's process.
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
    img: null,
  },
  {
    n: 2,
    title: 'Dehydrate',
    body: 'Dried low and slow, so the fruit keeps its character instead of cooking off.',
    img: null,
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
  return (
    <ol className="z-process-strip">
      {STEPS.map((s) => (
        <li className="z-process-step" key={s.n}>
          <div className="z-process-step__media">
            {s.img ? (
              (() => {
                const [wSm, wLg] = s.img.widths ?? [320, 560];
                const set = (ext) =>
                  `/images/${s.img.slug}-${wSm}.${ext} ${wSm}w, /images/${s.img.slug}-${wLg}.${ext} ${wLg}w`;
                return (
                  <picture>
                    <source
                      type="image/avif"
                      srcSet={set('avif')}
                      sizes="(min-width: 60em) 18vw, 44vw"
                    />
                    <source
                      type="image/webp"
                      srcSet={set('webp')}
                      sizes="(min-width: 60em) 18vw, 44vw"
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
