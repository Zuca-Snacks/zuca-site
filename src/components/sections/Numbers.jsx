/**
 * Numbers — what it is, in three figures.
 *
 * GUARDRAIL NOTE: these are nutrient-content statements plus one cited
 * population statistic. No disease is named and no benefit is promised to the
 * person eating it. "About 40% of your daily fiber" is the allowed form of the
 * fiber claim; "supports digestive health" is available if the conversion agent
 * wants a structure/function line here.
 */
import Card from '../ui/Card.jsx';

const NUMBERS = [
  { value: '10g', label: 'Fiber per serving', note: 'About 40% of your daily fiber' },
  { value: '150', label: 'Calories', note: 'Plus 4g of protein' },
  { value: '0g', label: 'Added sugar', note: '6g naturally occurring' },
];

export default function Numbers() {
  return (
    <section className="z-section z-container z-reveal" aria-labelledby="numbers-title">
      <span className="z-section__eyebrow">What it is</span>
      <h2 id="numbers-title">A snack built around the nutrient most of us miss.</h2>
      <p className="z-section__lede">
        95% of American adults and kids don&rsquo;t get enough fiber. Zuca is a
        bite made from upcycled apple pulp, with twice the fiber of the leading
        snack bars.
      </p>

      <ul className="z-numbers__grid">
        {NUMBERS.map((n) => (
          <Card as="li" key={n.label} className="z-number">
            <span className="z-number__value">{n.value}</span>
            <span className="z-number__label">{n.label}</span>
            <span className="z-number__note">{n.note}</span>
          </Card>
        ))}
      </ul>
    </section>
  );
}
