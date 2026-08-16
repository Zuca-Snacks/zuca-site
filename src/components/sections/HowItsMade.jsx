/**
 * HowItsMade — the upcycling story, on the inverted deep-green band.
 *
 * This is the section that most needs real photography and currently has none.
 * Rather than fake it with stock imagery of somebody else's product, the
 * numbered steps carry the story typographically. The exact shots needed are
 * listed in HANDOFF-ux.md.
 *
 * ⚠️ NO INPUT-COST FIGURES. The pulp disposal price was cut on merge (growth's
 * rule, see the pricing block in src/content/copy.js): it is supplier-
 * negotiation and competitor-intelligence information, and to a consumer it
 * reads "cheap" rather than "clever". Keep the upcycling story, no number on it.
 */
const STEPS = [
  {
    title: 'Juiceries throw the pulp away',
    body:
      'Pressing apples for juice leaves a mountain of pulp behind. It gets hauled off as waste — and rotting food waste accounts for 8% of US greenhouse gas emissions.',
  },
  {
    title: 'We take the fiber, not the waste',
    body:
      'That pulp is the fiber. We collect it, dry it and mill it before it can spoil, in facilities that meet 21 CFR 117 food-safety rules.',
  },
  {
    title: 'A chef turns it into something you crave',
    body:
      'Blended, rolled and finished into bites in two flavors. The test was never “is it healthy” — it was whether you reach for a second one.',
  },
];

export default function HowItsMade() {
  return (
    <section className="z-process z-section z-reveal" id="how-its-made" aria-labelledby="process-title">
      <div className="z-container">
        <span className="z-section__eyebrow" style={{ color: 'var(--z-warm)' }}>
          How it&rsquo;s made
        </span>
        <h2 id="process-title">Apple pulp was a disposal bill. We made it the ingredient.</h2>
        <p className="z-process__lede">
          The fiber was always there. Nobody had bothered to make it taste like
          anything.
        </p>

        <ol className="z-process__steps">
          {STEPS.map((s) => (
            <li className="z-process__step" key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
