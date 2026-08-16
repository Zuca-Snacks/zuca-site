/**
 * Hero — product shot, one-line promise, primary CTA, and an email field that
 * is reachable without scrolling on a 390x844 phone.
 *
 * COPY IS PLACEHOLDER. The conversion agent owns final wording. Everything
 * written here is checked against the brief's health-claim guardrails: nutrient
 * facts and taste only, no disease, no "physician-recommended".
 *
 * EMAIL FIELD OWNERSHIP
 * This is a presentational shell, not form logic (which the conversion agent
 * owns). On submit it does not POST anywhere — it dispatches a
 * `zuca:hero-email` CustomEvent carrying the typed address and moves focus to
 * the #waitlist section, so the real form can pick the value up and prefill.
 * See HANDOFF-ux.md.
 */
import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Field from '../ui/Field.jsx';
import Badge from '../ui/Badge.jsx';
import { ACTIVE_CTA, hero as copy, introLines, proof } from '../../content/copy.js';
import useWaitlistCount from '../../hooks/useWaitlistCount.js';

export default function Hero() {
  const [email, setEmail] = useState('');
  const count = useWaitlistCount();

  function handleSubmit(e) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    window.dispatchEvent(
      new CustomEvent('zuca:hero-email', { detail: { email: value } })
    );
    const target = document.getElementById('waitlist');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    }
  }

  return (
    <section className="z-hero z-container" id="top">
      <div className="z-hero__inner">
        <div className="z-hero__copy">
          {/* Part of the brand entrance: fades up with the wordmark.
              The trailing comma is stripped — the line is used standalone here,
              not as the first of three.
              ⚠️ DO NOT CUT THIS LINE TO BUY FOLD SPACE (Emil, 16 Aug). It is
              the highest-trust element on the page for a cold visitor, and it
              is one of the few credential statements the claim guardrails
              explicitly permit. */}
          <p className="z-hero__tagline">{introLines[0].replace(/,$/, '')}</p>

          {/* "Pre-order open" was removed at every breakpoint: nobody has paid,
              these are waitlist signups, and a badge implying an open
              transaction is a claim we cannot support. */}
          <div className="z-hero__eyebrow">
            <Badge>{copy.eyebrow}</Badge>
          </div>

          {/* Headline and subhead are A/B-switchable from one place — flip
              ACTIVE_HEADLINE in src/content/copy.js. Nothing is hardcoded here. */}
          <h1 className="z-hero__title">{copy.headline}</h1>

          {/* ORDER: the subhead sits BELOW the capture form, not above it
              (Emil, 16 Aug). Growth's headline and subhead are ~2.5x the length
              of the placeholder copy this hero was measured against, and with
              the subhead above the form the CTA landed 128px below the 844px
              fold on a 390px phone. Moving it costs no words. Reading order is
              now tagline -> headline -> email + CTA -> detail. */}
          <form className="z-hero__capture" onSubmit={handleSubmit} noValidate>
            <div className="z-hero__capture-row">
              <Field id="hero-email" label="Email" hint="No spam. Unsubscribe anytime.">
                {(props) => (
                  <Input
                    {...props}
                    type="email"
                    name="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" size="lg">
                {ACTIVE_CTA.step1}
              </Button>
            </div>
            {/* The count moved up into the badge over the photography, so it is
                no longer repeated here — it was being stated twice within one
                viewport. This line is now fixed-length reassurance only, which
                also means nothing in the capture form depends on a late fetch.
                Strings are still growth's; only their placement changed. */}
            <p className="z-hero__microcopy">{copy.reassurance}</p>
          </form>

          <p className="z-hero__lede">{copy.subhead}</p>
        </div>

        {/*
          PRODUCT-FORWARD HERO: both flavours in frame, so there is no doubt what
          this is. Each is a 1:1 crop with its own stat chips beneath, and the
          10g figure is a stamp straddling the pair.

          The stamp and the count badge are both ABSOLUTELY POSITIONED over the
          media. That is the single mechanism that satisfies both of Emil's
          rules at once: out of flow entirely, so an absent count leaves no
          reserved hole, AND an arriving count displaces nothing. Reserving a
          fixed-height row would have met the second rule by breaking the first.

          The first image is the LCP element and is preloaded in index.html —
          this markup is rendered by React, so the preload scanner cannot see it.
        */}
        <div className="z-hero__media">
          <div className="z-hero__products">
            {[
              {
                slug: 'flavor-chocolate-raspberry',
                name: 'Chocolate Raspberry Sea Salt',
                alt: 'Zuca chocolate raspberry sea salt bites, rolled in freeze-dried raspberry.',
                lcp: true,
              },
              {
                slug: 'flavor-maple-pecan',
                name: 'Maple Pecan',
                alt: 'Zuca maple pecan bites, rolled in toasted pecan and maple.',
                lcp: false,
              },
            ].map((f) => (
              <figure className="z-hero__product" key={f.slug}>
                <picture>
                  <source
                    type="image/avif"
                    srcSet={`/images/${f.slug}-360.avif 360w, /images/${f.slug}-640.avif 640w`}
                    sizes="(min-width: 48em) 22vw, 46vw"
                  />
                  <source
                    type="image/webp"
                    srcSet={`/images/${f.slug}-360.webp 360w, /images/${f.slug}-640.webp 640w`}
                    sizes="(min-width: 48em) 22vw, 46vw"
                  />
                  <img
                    src={`/images/${f.slug}-360.jpg`}
                    width="640"
                    height="640"
                    alt={f.alt}
                    fetchPriority={f.lcp ? 'high' : undefined}
                    loading={f.lcp ? undefined : 'lazy'}
                    decoding={f.lcp ? 'sync' : 'async'}
                  />
                </picture>
                <figcaption className="z-hero__product-name">{f.name}</figcaption>
              </figure>
            ))}

            {/* The 10g stamp. aria-hidden because the figure is already stated
                in each flavour's stat list — announcing it a third time is noise
                for a screen reader while being the whole point visually. */}
            <p className="z-hero__stamp" aria-hidden="true">
              <span className="z-hero__stamp-num">10g</span>
              <span className="z-hero__stamp-word">fiber</span>
            </p>
          </div>

          {/* ONE stats row, not one per flavour. The deck shows chips under each
              product, but the three numbers are byte-identical for both — the
              copy deck itself says "Two flavors. Same 10 grams." Printing them
              twice doubled the row height to state the same three facts twice
              and put the CTA 1px below the fold at 360px. One row, stated once,
              reads as a spec rather than as decoration. */}
          <ul className="z-hero__stats" aria-label="Per serving">
            {['10g fiber', '150 kcal', '4g protein'].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>

          {/* Count badge: rendered ONLY when the number exists. Absent, there is
              nothing here and the hero reads as complete. Present, it lands on
              top of the photography and pushes nothing. */}
          {count != null && count > 0 && (
            <p className="z-hero__count-badge">
              <span className="z-hero__count-num">{count.toLocaleString()}</span>
              <span className="z-hero__count-word">{proof.liveLabel}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
