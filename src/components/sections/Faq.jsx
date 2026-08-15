/**
 * Faq — accordion of the questions a cold visitor actually has.
 *
 * GUARDRAIL NOTE: the fiber answer is deliberately written as a nutrient-content
 * statement plus an allowed structure/function line. It names no condition. If
 * the conversion agent wants a stronger health answer here, it still cannot
 * name a disease — see the brief.
 */
import Accordion from '../ui/Accordion.jsx';

const ITEMS = [
  {
    id: 'faq-fiber',
    question: 'How much fiber is in one serving?',
    answer: (
      <p>
        10 grams — about 40% of the daily fiber most adults are told to aim for,
        and roughly twice what leading snack bars carry. Fiber supports
        digestive health.
      </p>
    ),
  },
  {
    id: 'faq-pulp',
    question: 'Apple pulp? Is that just waste?',
    answer: (
      <p>
        It&rsquo;s the fiber-rich part of the apple left after juicing, and
        juiceries currently pay to dispose of it. We collect it before it
        spoils, and dry and mill it in facilities that meet 21 CFR 117
        food-safety rules.
      </p>
    ),
  },
  {
    id: 'faq-taste',
    question: 'Does it taste like a health food?',
    answer: (
      <p>
        That was the whole problem we set out to solve. It was developed by a
        Michelin-trained chef, and at Stanford&rsquo;s Founder&rsquo;s Demo Day
        the samples were gone in 45 minutes.
      </p>
    ),
  },
  {
    id: 'faq-price',
    question: 'What will it cost?',
    answer: (
      <p>
        We&rsquo;re targeting $2.99 a bite. Joining the waitlist costs nothing
        and commits you to nothing — you&rsquo;ll get first access and the
        launch pricing before anyone else.
      </p>
    ),
  },
  {
    id: 'faq-when',
    question: 'When does it ship?',
    answer: (
      <p>
        We&rsquo;re in pre-order now and manufacturing with Step Change
        Innovations. Waitlist members hear the ship date first — no payment is
        taken today.
      </p>
    ),
  },
];

export default function Faq() {
  return (
    <section className="z-section z-container z-reveal" aria-labelledby="faq-title">
      <span className="z-section__eyebrow">Questions</span>
      <h2 id="faq-title">Before you sign up.</h2>
      <div className="z-faq__list">
        <Accordion items={ITEMS} defaultOpenId="faq-fiber" />
      </div>
    </section>
  );
}
