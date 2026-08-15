/**
 * ProofStrip — the three traction facts, straight from the brief's verified list.
 * Placed immediately after the hero so the claim is backed before the scroll.
 */
const PROOF = [
  { figure: '130+', label: 'pre-orders placed before launch' },
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
