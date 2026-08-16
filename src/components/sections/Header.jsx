/**
 * Header — wordmark + minimal nav.
 *
 * Not sticky: the page already carries a sticky bottom CTA on mobile, and two
 * fixed bars on an 844px-tall phone eats the fold twice.
 *
 * THE BRAND MOMENT lives here. The old site opened on a full-screen click gate
 * that had to be tapped before any content existed. That is replaced by a
 * 760ms letter-in entrance on this wordmark: it is non-blocking (everything
 * below is interactive from the first frame), it finishes instantly on any
 * scroll / tap / keypress, and it does not run at all under reduced motion.
 * The old gate is preserved at src/components/IntroGate.jsx.
 */
import { useEffect, useState } from 'react';
import Button from '../ui/Button.jsx';

export default function Header() {
  const [snap, setSnap] = useState(false);

  useEffect(() => {
    const finish = () => setSnap(true);
    const opts = { once: true, passive: true };
    window.addEventListener('scroll', finish, opts);
    window.addEventListener('pointerdown', finish, opts);
    window.addEventListener('keydown', finish, opts);
    const t = setTimeout(finish, 800);
    return () => {
      window.removeEventListener('scroll', finish);
      window.removeEventListener('pointerdown', finish);
      window.removeEventListener('keydown', finish);
      clearTimeout(t);
    };
  }, []);

  return (
    <header className="z-header z-container">
      <a
        className="z-header__wordmark"
        href="#top"
        aria-label="Zuca — home"
        data-snap={snap ? 'true' : 'false'}
      >
        {['Z', 'U', 'C', 'A'].map((letter, i) => (
          <span key={i} aria-hidden="true">
            {letter}
          </span>
        ))}
      </a>

      <nav className="z-header__nav" aria-label="Primary">
        <a className="z-header__link" href="#how-its-made">
          How it&rsquo;s made
        </a>
        <a className="z-header__link" href="#flavors">
          Flavors
        </a>
        {/* Hidden on phones: the hero's own email field is right below it and
            the sticky bar covers the rest of the page. */}
        <Button
          as="a"
          href="#waitlist"
          variant="secondary"
          className="z-header__cta"
        >
          Join the waitlist
        </Button>
      </nav>
    </header>
  );
}
