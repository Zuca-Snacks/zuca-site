/**
 * WaitlistSlot — the section the waitlist form mounts into.
 *
 * The shell (section, heading, stable `#waitlist` id, `.z-waitlist-mount`
 * container) is UX's; the form passed as children is growth's and owns all
 * validation, POSTing, consent and analytics.
 *
 *     <WaitlistSlot>
 *       <WaitlistForm />
 *     </WaitlistSlot>
 *
 * MERGE NOTE: the standalone placeholder form that used to render when no
 * children were passed is DELETED. It existed so the page was never broken-
 * looking mid-merge; now that the real form is wired in, keeping it would mean
 * a second consent checkbox and a second email field that POST nowhere — the
 * exact double-mount failure this section is supposed to prevent. There is one
 * waitlist form on the page and it is growth's.
 *
 * PREFILL: the hero's email field dispatches a `zuca:hero-email` CustomEvent on
 * window with `{ detail: { email } }`. Step1Email listens for it.
 *
 * The <section> takes tabIndex={-1} so the hero can move focus here after the
 * smooth scroll without adding it to the tab order.
 */
import { sections } from '../../content/copy.js';

export default function WaitlistSlot({ children }) {
  return (
    <section
      id="waitlist"
      className="z-waitlist-slot z-section"
      tabIndex={-1}
      aria-labelledby="waitlist-title"
    >
      <div className="z-container">
        <div className="z-waitlist-slot__inner">
          <div>
            {/* Labelled "Waitlist", not "Pre-order" — this form takes an email,
                not an order, and no payment is collected anywhere on the site. */}
            <span className="z-section__eyebrow">Waitlist</span>
            <h2 id="waitlist-title" className="z-waitlist-slot__title">
              {sections.waitlist.title}
            </h2>
            {/* The count is deliberately NOT repeated here.
                It was appended to this lede as a second sentence, which grew the
                section by 38px the moment the number arrived — the count clause
                wrapped to a new line. Reserving a blank line instead would have
                traded a late shift for a permanent gap.
                It is already stated three times above this point: the hero
                badge, the proof strip and the sticky bar. Dropping the fourth
                removes the shift outright and is the same de-duplication the UX
                agent applied to the hero microcopy. */}
            <p className="z-section__lede">{sections.waitlist.body}</p>
          </div>

          {children}
        </div>
      </div>
    </section>
  );
}
