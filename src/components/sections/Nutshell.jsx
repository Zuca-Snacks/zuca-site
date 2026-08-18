/**
 * Nutshell — the three composed blocks below the hero, in the order the section
 * comp stacks them: upcycle flow, process steps, core problem.
 *
 * ⚠️ THESE ARE COMPOSED IMAGES WITH THE TEXT BAKED IN, which the site otherwise
 * avoids for exactly the reasons that apply here: baked text cannot be read by
 * a screen reader, cannot reflow, and cannot be corrected without a round trip
 * to Canva. That cost is accepted for these three, so it has to be PAID rather
 * than ignored — every block carries both a descriptive alt AND a
 * visually-hidden text equivalent containing everything a sighted visitor gets:
 * the flow as a sentence, the four step names, and all three statistics with
 * their figures and labels.
 *
 * ⚠️ NO COPY CONNECTING THE STATISTICS TO THE PRODUCT. They are population and
 * environmental facts, which the claim guardrails permit on their own. Adding a
 * sentence that joins them to Zuca — "95% fall short, so eat this" — is disease
 * framing arriving by implication rather than by name. The section deliberately
 * has no lede, no CTA and no linking sentence.
 */
import useNearViewport, { BLANK } from '../../hooks/useNearViewport.js';

const BLOCKS = [
  {
    slug: 'nutshell-flow',
    w: 1090,
    h: 811,
    title: 'In a nutshell',
    alt:
      'Illustrated flow titled “In a nutshell”. A person picks apples from a tree. ' +
      'The apples go into a press, which produces juice and a small pile of pulp. ' +
      'One arrow, marked with a red cross, leads that pulp to a landfill bin. ' +
      'Another, marked with a green tick, leads it to a larger pile of pulp and on to Zuca.',
    /* The flow as a sentence, per the brief for this section. */
    equivalent:
      'In a nutshell: apples are picked and pressed for juice. Pressing leaves ' +
      'pulp behind. That pulp is normally sent to landfill. Zuca takes it instead.',
  },
  {
    slug: 'process-steps',
    w: 1107,
    h: 641,
    title: 'We upcycle fruit pulp into fiber-packed snacks',
    alt:
      'Four photographic steps under the heading “We upcycle fruit pulp into ' +
      'fiber-packed snacks”. Step 1, wet pressed fruit pulp. Step 2, the same pulp ' +
      'dried and milled to a pale flour. Step 3, the other ingredients. ' +
      'Step 4, the finished bites in both flavours.',
    equivalent:
      'We upcycle fruit pulp into fiber-packed snacks, in four steps. ' +
      'Step 1: collect the pressed pulp. Step 2: dry and mill it. ' +
      'Step 3: add the other ingredients. Step 4: roll into bites.',
  },
  {
    slug: 'problem-cycle',
    w: 1114,
    h: 735,
    title: 'The core problem',
    alt:
      'A cycle diagram titled “The core problem”, linking food waste to the fiber gap ' +
      'with arrows between five stages.',
    /* All three statistics, each with its figure AND its label. */
    equivalent:
      'The core problem. Over 120 billion pounds of food is wasted per year in the ' +
      'United States, mostly fruit and vegetables. Rotting food waste accounts for ' +
      '8% of US greenhouse gas emissions. That waste contains nutrients most people ' +
      'do not get enough of, and yet 95% of Americans do not get enough fiber.',
  },
];

export default function Nutshell() {
  /* Bytes wait until the section nears the viewport. loading="lazy" alone was
     measured fetching all three during the initial paint, which cost LCP 0.2s.
     See useNearViewport for why the attribute is not sufficient on its own. */
  const [ref, near] = useNearViewport();

  return (
    <section className="z-nutshell z-section" id="nutshell" aria-labelledby="nutshell-title">
      <h2 id="nutshell-title" className="z-visually-hidden">
        How Zuca works
      </h2>

      <div className="z-container z-nutshell__stack" ref={ref}>
        {BLOCKS.map((b) => (
          <figure className="z-nutshell__block" key={b.slug}>
            <picture>
              {near && (
                <>
                  <source
                    type="image/avif"
                    srcSet={`/images/${b.slug}-420.avif 420w, /images/${b.slug}-780.avif 780w, /images/${b.slug}-${b.w}.avif ${b.w}w`}
                    sizes="(min-width: 48em) 46rem, 100vw"
                  />
                  <source
                    type="image/webp"
                    srcSet={`/images/${b.slug}-420.webp 420w, /images/${b.slug}-780.webp 780w, /images/${b.slug}-${b.w}.webp ${b.w}w`}
                    sizes="(min-width: 48em) 46rem, 100vw"
                  />
                </>
              )}
              {/* width/height carry the real aspect ratio, so the box is
                  reserved before the bytes arrive and nothing shifts. */}
              <img
                src={near ? `/images/${b.slug}-420.webp` : BLANK}
                width={b.w}
                height={b.h}
                alt={b.alt}
                loading="lazy"
                decoding="async"
              />
            </picture>

            {/* Everything the picture says, for anyone who cannot see it. Not a
                caption — it is the same content, not a summary of it. */}
            <figcaption className="z-visually-hidden">{b.equivalent}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
