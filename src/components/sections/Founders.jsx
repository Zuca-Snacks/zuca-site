/**
 * Founders — the trust section.
 *
 * PHOTOGRAPHY GAP: there are no founder portraits in the repo. Real faces are
 * the single highest-trust element this section can have, so they are requested
 * in HANDOFF-ux.md. Until they arrive, a monogram stands in — it reads as a
 * deliberate placeholder rather than pretending to be a photo of someone.
 *
 * ⚠️ GUARDRAIL — DO NOT REINSTATE.
 * The previous site listed "Reversed autoimmune disease through plant-based
 * diet" under Dr. Yuan. It is CUT, not reworded — Emil's explicit decision.
 * The line is fine in an investor deck and dangerous on a consumer product
 * page: sitting inches from the product, next to a physician's credentials, it
 * reads as an implied claim that the product treats disease. Nothing about a
 * named condition belongs in this section in any wording.
 *
 * The authority it carried is replaced by credentials that carry no claim:
 * Stanford Medicine physician, and leading Zuca's clinical network of 10+
 * physicians across 7 specialties. Logged in HANDOFF-ux.md for Cooley to
 * confirm.
 */
const FOUNDERS = [
  {
    monogram: 'EN',
    name: 'Emil Nordin',
    role: 'Chef & co-founder',
    creds: [
      'Norway’s Most Promising Young Chef, 2021',
      'Trained at Kontrast — two Michelin stars and a Green Star',
      'Stanford Bioengineering ’26',
    ],
  },
  {
    monogram: 'KY',
    name: 'Kelley Yuan, MD',
    role: 'Physician & co-founder',
    creds: [
      'Stanford Medicine physician',
      'Leads Zuca’s clinical network — 10+ physicians across 7 specialties',
      'Sustainability Fellow',
    ],
  },
];

export default function Founders() {
  return (
    <section className="z-section z-container z-reveal" aria-labelledby="founders-title">
      <span className="z-section__eyebrow">Who made it</span>
      <h2 id="founders-title">A Michelin-trained chef and a Stanford physician.</h2>
      <p className="z-section__lede">
        One of us cares whether it tastes good. The other cares what&rsquo;s in it.
      </p>

      <ul className="z-founders__grid">
        {FOUNDERS.map((f) => (
          <li className="z-founder" key={f.name}>
            <div className="z-founder__head">
              <span className="z-founder__monogram" aria-hidden="true">
                {f.monogram}
              </span>
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

      <p className="z-fineprint" style={{ marginTop: 'var(--z-space-5)' }}>
        Supported by Stanford&rsquo;s NEXT Accelerator. Regulatory counsel
        provided pro bono by Cooley LLP. Manufactured with Step Change
        Innovations.
      </p>
    </section>
  );
}
