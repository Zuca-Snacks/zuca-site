/**
 * FiberGap — the one statistic from the deck's "What's the problem?" slide,
 * rebuilt as HTML.
 *
 * ⚠️ WHAT THIS SECTION MAY AND MAY NOT CONTAIN (Emil, 16 Aug).
 * The deck slide carried the 95% figure alongside disease names, competitor
 * packaging and imagery implying the product addresses a condition. NONE of
 * that comes across. This is the population statistic and nothing else.
 *
 * The 95% figure is explicitly allowed by the claim guardrails because it is a
 * cited fact about the population, not a claim about the product: it says what
 * is true of people, never that Zuca fixes it. Do not add a second sentence
 * connecting the two — "95% fall short, so eat this" is the disease framing
 * arriving by implication rather than by name. If this section ever needs that
 * connection to make sense, delete the section instead.
 *
 * Wording is growth's, reused verbatim from the FAQ answer in copy.js rather
 * than paraphrased here, so there is one phrasing of the statistic on the site.
 */
export default function FiberGap() {
  return (
    <section className="z-gap z-reveal" aria-labelledby="gap-figure">
      <div className="z-gap__art" aria-hidden="true" />
      <div className="z-container z-gap__inner">
        <p className="z-gap__figure" id="gap-figure">
          95%
        </p>
        <p className="z-gap__label">
          of American adults and kids fall short on fiber.
        </p>
      </div>
    </section>
  );
}
