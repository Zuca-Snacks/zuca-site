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
          {/* ⚠️ THIS SLOT IS RESERVED FOR THE REAL POSTAL ADDRESS.
              "Stanford, CA." was removed on 20 Aug 2026. Each Stanford
              reference on the page is true on its own — two Stanford-affiliated
              founders, the institutional supporter line — but a Stanford, CA
              business address on top of them stacks into an affiliation claim
              Emil has not made and does not want. The pieces were fine; the
              accumulation was not.
              privacy.html §11 promises every email carries our physical postal
              address, so a real one lands here once the PO Box exists. A city
              and state would not have satisfied that anyway. */}
          Upcycled apple pulp, made into something worth eating.
        </p>

        <p className="z-footer__meta">
          {/* emil@ for general contact. The legal pages use privacy@ for GDPR
              rights requests — a statutory one-month clock should not land in a
              personal inbox. Do not point this link at privacy@. */}
          <a href="mailto:emil@zucasnacks.com">emil@zucasnacks.com</a>
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
