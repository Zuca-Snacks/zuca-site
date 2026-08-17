/**
 * SupporterWall — the "supported by" logo wall from the hero comp.
 *
 * ⚠️ DELIBERATELY BELOW THE FOLD, after the founders section (Emil, 17 Aug).
 * The comp places it in the hero. It was moved for two reasons, neither of them
 * permission — all eleven relationships are cleared:
 *   1. Eleven images in the critical path costs LCP the budget does not have.
 *   2. In the hero it displaces the email capture block, which is the one
 *      load-bearing conversion element on the page.
 * Above the fold it costs signups; here it does the same credibility work for
 * free.
 *
 * ⚠️ CONTENT GUARDRAIL — do not add copy about FDA, regulatory counsel or
 * clinical endorsement anywhere near this wall. The logos alone are a statement
 * of who supports the company. Logos PLUS a sentence about ex-FDA counsel is
 * the combination that reads as regulatory endorsement, which the claim rules
 * forbid. The heading stays neutral and no logo gets a caption.
 *
 * ONE image, not eleven. Canva's SVG export was 21 embedded base64 PNGs — 99%
 * of a 670KB file, a raster in a vector wrapper — so the flat PNG is the
 * correct source at roughly a fifth of the weight.
 */
export default function SupporterWall() {
  return (
    <section
      className="z-supporters z-section z-reveal"
      aria-labelledby="supporters-title"
    >
      <div className="z-container">
        <h2 id="supporters-title" className="z-supporters__title">
          Supported by
        </h2>

        <picture>
          <source
            type="image/avif"
            srcSet="/images/logos-supported-by-640.avif 640w, /images/logos-supported-by-968.avif 968w"
            sizes="(min-width: 48em) 720px, 100vw"
          />
          <source
            type="image/webp"
            srcSet="/images/logos-supported-by-640.webp 640w, /images/logos-supported-by-968.webp 968w"
            sizes="(min-width: 48em) 720px, 100vw"
          />
          {/*
            One alt string naming every organisation, rather than eleven images
            with eleven alts. It is a single graphic, so a screen reader should
            get a single description of what it shows.
          */}
          <img
            className="z-supporters__wall"
            src="/images/logos-supported-by-640.webp"
            width="968"
            height="304"
            alt={
              'Supported by Stanford Mussallem Center for Biodesign, Stanford Medicine, ' +
              'A Little Bird, Strike, Cooley, Cardinal Ventures, Step Change Innovations, ' +
              'Emergence, Stanford Center on Longevity Design Challenge, Vituity, and Burnette Foods.'
            }
            loading="lazy"
            decoding="async"
          />
        </picture>
      </div>
    </section>
  );
}
