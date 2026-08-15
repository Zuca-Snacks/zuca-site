/**
 * WaitlistSlot — the mount point for the conversion agent's waitlist form.
 *
 * ⚠️  OWNERSHIP BOUNDARY
 * This file provides the SHELL only: the section, its heading, the stable
 * `#waitlist` id, and the `.z-waitlist-mount` container. It contains no
 * validation, no POST, no analytics, and no field state.
 *
 * The conversion agent should render its form as `children`:
 *
 *     <WaitlistSlot>
 *       <MyWaitlistForm />
 *     </WaitlistSlot>
 *
 * When no children are passed, a visually complete placeholder renders instead,
 * built from the same UI primitives the real form should use, so the page is
 * never broken-looking mid-merge. The placeholder does not submit anywhere.
 *
 * PREFILL: the hero's email field dispatches a `zuca:hero-email` CustomEvent on
 * window with `{ detail: { email } }`. Listen for it to prefill step one.
 *
 * The <section> takes tabIndex={-1} so the hero can move focus here after the
 * smooth scroll without adding it to the tab order.
 */
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Field from '../ui/Field.jsx';
import Checkbox from '../ui/Checkbox.jsx';

function PlaceholderForm() {
  return (
    <form
      className="z-waitlist-mount"
      data-z-placeholder="true"
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      <Field
        id="waitlist-email-placeholder"
        label="Email"
        hint="Only your email is required. No payment today."
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        )}
      </Field>

      {/* Consent block — layout only. The wording, the version string and the
          POST are the conversion agent's. consent_marketing is required and
          must be true, so the shell shows it unchecked and unticked by default:
          never pre-tick a consent box, it is not freely given consent. */}
      <Checkbox
        id="waitlist-consent-placeholder"
        consentVersion="placeholder-v0"
        label="Email me when Zuca launches."
        legal={
          <>
            We&rsquo;ll only use your address to tell you about the launch.
            Unsubscribe anytime. See our <a href="/privacy">Privacy Policy</a>.
          </>
        }
      />

      <Button type="submit" size="lg" block>
        Join the waitlist
      </Button>
    </form>
  );
}

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
              Get first access when it ships.
            </h2>
            <p className="z-section__lede">
              130+ people are already on the list. It takes one field.
            </p>
          </div>

          {children ?? <PlaceholderForm />}
        </div>
      </div>
    </section>
  );
}
