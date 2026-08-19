/**
 * Button
 *
 * Props
 *   type      defaults to 'button', NOT the HTML default of 'submit'. A button
 *             that submits must say type="submit". See the render below.
 *   variant   'primary' | 'secondary' | 'ghost' | 'quiet'   default 'primary'
 *
 * ⚠️ PICK BY THE BUTTON'S JOB, NOT BY HOW LOUD YOU WANT IT. There are four
 * weights because a multi-step form needs four, and the ordering carries
 * meaning a designer can otherwise flatten by accident:
 *
 *   primary    the action the page IS ASKING FOR   filled --z-cta   Continue
 *   secondary  the same ask, lower emphasis        --z-cta outline
 *   ghost      a utility the user may want         neutral ink      Back, Skip
 *   quiet      an exit / opt-out                   muted, text-only Finish early
 *
 * ⚠️ GREEN IS NOT "MOVES FORWARD". It is "this is what we are asking you to
 * do". A Skip advances the wizard, but it is the user DECLINING the ask, so it
 * is never --z-cta — two green buttons on one screen means the primary has
 * stopped meaning anything. This came up directly: growth's step 2 has three
 * controls where "Skip this one" advances, and the role model still puts it in
 * ghost.
 *   size      'md' | 'lg'                          default 'md'
 *   block     boolean   full-width                 default false
 *   loading   boolean   shows spinner, disables and announces busy
 *   disabled  boolean
 *   as        'button' | 'a'                       default 'button'
 *   href      string    required when as='a'
 *   children  node      the visible label
 *   ...rest   forwarded to the underlying element (onClick, type, aria-*, …)
 *
 * Notes
 *   - While loading the label stays in the DOM (visibility:hidden) so the
 *     button never changes width mid-interaction.
 *   - aria-busy is set so screen readers announce the pending state.
 */
import { warnIgnored } from './devWarn.js';

export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  as = 'button',
  href,
  children,
  className = '',
  ...rest
}) {
  warnIgnored(
    'Button',
    as === 'a' && !href,
    'has as="a" but no `href`, so it renders an anchor with no destination — ' +
      'not focusable, not clickable, and invisible to a screen reader as a link.'
  );
  warnIgnored(
    'Button',
    as !== 'a' && href != null,
    'was given `href` without as="a". It renders a <button>, so the href is ' +
      'IGNORED and the control goes nowhere.'
  );

  const classes = [
    'z-btn',
    variant !== 'primary' && `z-btn--${variant}`,
    size === 'lg' && 'z-btn--lg',
    block && 'z-btn--block',
    loading && 'z-btn--loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="z-btn__label">{children}</span>
      {loading && <span className="z-btn__spinner" aria-hidden="true" />}
    </>
  );

  if (as === 'a') {
    return (
      <a
        href={href}
        className={classes}
        aria-disabled={disabled || loading || undefined}
        {...rest}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      /* ⚠️ type="button" IS THE DEFAULT, AND IT IS A BUG FIX, NOT A STYLE
         CHOICE. HTML defaults a <button> inside a <form> to type="submit", so
         every Back/Skip/dismiss control rendered here submitted the form. It
         shipped: growth reported "Back goes forward" on the waitlist, and Skip
         had the same fault unreported. They worked around it by writing
         type="button" on all four of their call sites and leaving a warning
         comment — a workaround every future caller would have had to know
         about, in a component whose whole job is that they should not.
         A submit must now say so. Every call site in the tree already sets its
         type explicitly, so this changes no current behaviour; it removes the
         trap. `rest` is spread AFTER, so an explicit type still wins. */
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}
