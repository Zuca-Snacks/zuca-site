/**
 * ProofStrip — the three traction facts, straight from the brief's verified list.
 * Placed immediately after the hero so the claim is backed before the scroll.
 */
/**
 * ⚠️ "130+ pre-orders" is listed as a verified fact in AGENTS_BRIEF.md, but Emil
 * has since confirmed nobody has paid — the 130+ are waitlist signups, not
 * orders. "Pre-orders" implies a transaction we cannot evidence, so the label
 * below says "signed up". The brief's verified-facts list should be corrected at
 * source so the other two agents don't reintroduce the stronger wording.
 * Flagged in HANDOFF-ux.md.
 */
const PROOF = [
  { figure: '130+', label: 'signed up before we launched' },
  { figure: '45 min', label: 'to run out at Stanford Founder’s Demo Day' },
  { figure: 'Day 1', label: 'samples gone at the Vituity Health symposium' },
];

export default function ProofStrip() {
  return (
    <section className="z-proof" aria-label="Traction so far">
      <div className="z-container">
        <ul className="z-proof__list">
          {PROOF.map((p) => (
            <li className="z-proof__item" key={p.figure}>
              <span className="z-proof__figure">{p.figure}</span>
              <span className="z-proof__label">{p.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
