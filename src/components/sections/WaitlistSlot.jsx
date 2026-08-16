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
import { proof, sections } from '../../content/copy.js';
import useWaitlistCount from '../../hooks/useWaitlistCount.js';

export default function WaitlistSlot({ children }) {
  const count = useWaitlistCount();

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
            <p className="z-section__lede">
              {sections.waitlist.body}{' '}
              <span className="z-waitlist-slot__count">
                {count != null && count > 0
                  ? `${count.toLocaleString()} ${proof.liveLabel}.`
                  : ''}
              </span>
            </p>
          </div>

          {children}
        </div>
      </div>
    </section>
  );
}
