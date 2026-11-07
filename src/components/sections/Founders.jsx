/**
 * Founders — the trust section.
 *
 * PHOTOGRAPHY GAP: there are no founder portraits in the repo. Real faces are
 * the single highest-trust element this section can have, so they are requested
 * Real portraits shipped 16 Aug, replacing the monogram placeholders.
 *
 * ⚠️ GUARDRAIL: nothing about a named medical condition belongs in this
 * section in any wording. On a consumer product page, beside the product, it
 * reads as an implied claim that the product treats disease.
 *
 * Copy (names, roles, credential lists, section heading) is growth's and lives
 * in src/content/copy.js. The guardrail above is a constraint on what may be
 * added there, not a second copy of the list.
 */
import { founders, sections } from '../../content/copy.js';

/* Portraits are keyed off the name in copy.js rather than stored there, so
   growth owns the words and this file owns the pictures. A founder with no
   entry here simply renders without a portrait — it degrades, it does not
   break. */
const PORTRAITS = {
  'Emil Nordin': {
    slug: 'founder-emil',
    alt: 'Emil Nordin, founder, photographed outdoors at golden hour.',
  },
};

export default function Founders() {
  return (
    <section className="z-section z-container z-reveal" aria-labelledby="founders-title">
      <span className="z-section__eyebrow">Who made it</span>
      <h2 id="founders-title">{sections.founders.title}</h2>
      {sections.founders.body ? (
        <p className="z-section__lede">{sections.founders.body}</p>
      ) : null}

      <ul className="z-founders__grid">
        {founders.map((f) => (
          <li className="z-founder" key={f.name}>
            <div className="z-founder__head">
              {PORTRAITS[f.name] ? (
                <picture className="z-founder__portrait">
                  <source
                    type="image/avif"
                    srcSet={`/images/${PORTRAITS[f.name].slug}-128.avif 128w, /images/${PORTRAITS[f.name].slug}-244.avif 244w`}
                    sizes="72px"
                  />
                  <source
                    type="image/webp"
                    srcSet={`/images/${PORTRAITS[f.name].slug}-128.webp 128w, /images/${PORTRAITS[f.name].slug}-244.webp 244w`}
                    sizes="72px"
                  />
                  <img
                    src={`/images/${PORTRAITS[f.name].slug}-128.jpg`}
                    width="244"
                    height="244"
                    alt={PORTRAITS[f.name].alt}
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              ) : null}
              <span>
                <h3 className="z-founder__name">{f.name}</h3>
                <span className="z-founder__role">{f.role}</span>
              </span>
            </div>
            <ul className="z-founder__creds">
              {f.creds.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

    </section>
  );
}
