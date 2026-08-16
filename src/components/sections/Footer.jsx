/**
 * Footer.
 *
 * The /privacy and /terms links point at routes the security agent owns and
 * which may not exist until that branch merges. They are written as plain
 * paths so they light up automatically once those pages land — see
 * HANDOFF-ux.md.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="z-footer">
      <div className="z-container z-footer__inner">
        <span className="z-footer__wordmark">ZUCA</span>

        <p className="z-footer__meta">
          Upcycled apple pulp, made into something worth eating. Stanford, CA.
        </p>

        <p className="z-footer__meta">
          <a href="mailto:letschat@zucasnacks.com">letschat@zucasnacks.com</a>
          {' · '}
          <a href="/privacy">Privacy</a>
          {' · '}
          <a href="/terms">Terms</a>
        </p>

        <p className="z-footer__meta">© {year} Zuca Snacks</p>
      </div>
    </footer>
  );
}
