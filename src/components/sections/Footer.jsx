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
          {/* ⚠️ THE LOCATION SLOT IS DELIBERATELY EMPTY — do not backfill it
              with a city (Emil, 19 Aug, carried here from growth@9419dbb so the
              merge does not arbitrate a claim removal).
              "Stanford, CA" was removed. Each Stanford reference on the page is
              true alone — two Stanford-affiliated founders, the institutional
              supporter line in the hero and the supporter wall — but a Stanford
              business address sitting directly above the contact email and the
              copyright is the canonical "where the company is" slot, and
              stacked on the rest it asserts an institutional affiliation Emil
              has not claimed. His words: the pieces were fine, the accumulation
              was not.
              What belongs here eventually is the REAL postal address, once the
              PO Box exists: privacy.html §11 promises every email carries one,
              and a city and state would never have satisfied CAN-SPAM. */}
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
