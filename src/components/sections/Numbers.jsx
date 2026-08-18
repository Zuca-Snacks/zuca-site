/**
 * Numbers — what it is, in three figures.
 *
 * GUARDRAIL NOTE: these are nutrient-content statements. No disease is named
 * and no benefit is promised to the person eating it. Copy is growth's and
 * lives in src/content/copy.js — the footnote there carries the tree-nut
 * allergen statement, which is the only allergen fact confirmed in writing.
 */
import Card from '../ui/Card.jsx';
import { numbers } from '../../content/copy.js';

export default function Numbers() {
  return (
    <section className="z-section z-container z-reveal" aria-labelledby="numbers-title">
      <span className="z-section__eyebrow">What it is</span>
      <h2 id="numbers-title">{numbers.title}</h2>

      <ul className="z-numbers__grid">
        {numbers.items.map((n) => (
          <Card as="li" key={n.unit} className="z-number">
            <span className="z-number__value">{n.value}</span>
            <span className="z-number__label">{n.unit}</span>
            <span className="z-number__note">{n.note}</span>
          </Card>
        ))}
      </ul>

      <p className="z-fineprint">{numbers.footnote}</p>
    </section>
  );
}
