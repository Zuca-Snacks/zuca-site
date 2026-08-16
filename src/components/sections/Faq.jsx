/**
 * Faq — the objection-handling questions, ordered by what actually stops a
 * signup rather than by what is easiest to answer.
 *
 * Copy is growth's (src/content/copy.js) and is claim-checked there:
 *   - No price figure anywhere. The waitlist measures willingness to pay via
 *     price_band in step 2, and a number on this page anchors that answer.
 *   - The allergen answer states tree nuts only. Gluten, dairy and shared-
 *     facility cross-contact are NOT confirmed in writing yet and must not be
 *     added here — see the blocking TODO at the top of copy.js.
 *
 * The <details> markup growth shipped is replaced by the UX Accordion, which
 * this page already uses; `onOpen` preserves growth's faq_open event.
 */
import Accordion from '../ui/Accordion.jsx';
import { faq, sections } from '../../content/copy.js';
import { EVENTS, track } from '../../lib/analytics.js';

const ITEMS = faq.map((item, i) => ({
  id: `faq-${i}`,
  question: item.q,
  answer: <p>{item.a}</p>,
}));

export default function Faq() {
  return (
    <section className="z-section z-container z-reveal" aria-labelledby="faq-title">
      <span className="z-section__eyebrow">Questions</span>
      <h2 id="faq-title">{sections.faq.title}</h2>
      <div className="z-faq__list">
        <Accordion
          items={ITEMS}
          defaultOpenId="faq-0"
          onOpen={(_id, index) => track(EVENTS.FAQ_OPEN, { index })}
        />
      </div>
    </section>
  );
}
