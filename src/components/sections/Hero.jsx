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
  const hasCount = count != null && count > 0;

  /* The count band never renders empty. When the number is unavailable — which
     is every visit until the endpoint is configured — a static line occupies
     exactly the same reserved height, so there is no visible hole AND no shift
     when the number later swaps in.

     ⚠️ INTERIM STRING. Growth owns this copy and is writing a purpose-made
     line; the moment `hero.countFallback` exists in copy.js it is used with no
     change here. Until then the eyebrow stands in, and the eyebrow badge is
     suppressed while it does so, because showing the same sentence twice in one
     viewport is worse than showing it once in the better position. */
  const countFallback = copy.countFallback ?? copy.eyebrow;
  const usingInterimFallback = !hasCount && !copy.countFallback;

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
      {/* Decorative ingredient illustration layer. See sections.css — this is a
          SLOT: there is no artwork asset in the repo yet, so it currently
          renders a soft botanical wash built from gradients. It is aria-hidden
          and purely decorative either way. */}
      <div className="z-hero__backdrop" aria-hidden="true" />

      {/* Botanical clusters. Anchored to the WORDMARK, not to the stacks: the
          comp runs them from just under the wordmark down through the plates,
          bleeding off each outer edge. Above the fold, hence the small encode. */}
      <span className="z-hero__stack-art z-hero__stack-art--berry" aria-hidden="true" />
      <span className="z-hero__stack-art z-hero__stack-art--maple" aria-hidden="true" />

      {/* The wordmark at poster scale, as the mockup has it. The <header> one
          is hidden while this is on screen — see .z-header__wordmark rules —
          so the page still has exactly one visible ZUCA above the fold. */}
      {/* role="img" + aria-label: aria-label is PROHIBITED on a bare <p>, which
          failed the audit. role="img" gives it a role that permits a name and
          collapses the four animated spans into one announcement, "Zuca",
          instead of four separate letters. */}
      <p className="z-hero__wordmark" role="img" aria-label="Zuca">
        {['Z', 'U', 'C', 'A'].map((letter, i) => (
          <span key={i} aria-hidden="true">
            {letter}
          </span>
        ))}
      </p>

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
          {!usingInterimFallback && (
            <div className="z-hero__eyebrow">
              <Badge>{copy.eyebrow}</Badge>
            </div>
          )}

          {/* Headline and subhead are A/B-switchable from one place — flip
              ACTIVE_HEADLINE in src/content/copy.js. Nothing is hardcoded here. */}
          <h1 className="z-hero__title">{copy.headline}</h1>

          {/* ORDER: the subhead sits BELOW the capture form, not above it
              (Emil, 16 Aug). Growth's headline and subhead are ~2.5x the length
              of the placeholder copy this hero was measured against, and with
              the subhead above the form the CTA landed 128px below the 844px
              fold on a 390px phone. Moving it costs no words. Reading order is
              now tagline -> headline -> email + CTA -> detail. */}
          {/* The comp's red "JOIN THE WAITLIST" line. Emil's call was heading
              or button label; heading keeps the comp's visual exactly AND
              leaves the button carrying growth's outcome-worded label, rather
              than replacing a tested CTA string with a poster's. */}
          <p className="z-hero__cta-heading">Join the waitlist</p>

          <form className="z-hero__capture" onSubmit={handleSubmit} noValidate>
            <div className="z-hero__capture-row">
              {/* No hint: it read "No spam. Unsubscribe anytime." directly
                  above a microcopy line that already says "No payment, no spam,
                  unsubscribe in one click." Two reassurances 60px apart saying
                  the same thing, costing ~20px of fold. Growth's line is the
                  one that survives — it is the stronger of the two and it is
                  their copy to own. */}
              <Field id="hero-email" label="Email">
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

          {/* The mockup's closing statement. aria-hidden: "10g fiber" is
              already announced twice in the spec stacks above and once in the
              subhead — a fourth reading is noise to a screen reader while being
              the whole composition visually. It also sits BELOW the capture
              form, so it never competes with the CTA for the fold. */}
          <span className="z-hero__fruit z-hero__fruit--left" aria-hidden="true" />
          <span className="z-hero__fruit z-hero__fruit--right" aria-hidden="true" />

          <p className="z-hero__bigfig" aria-hidden="true">
            10g fiber
          </p>
        </div>

        {/*
          PRODUCT-FORWARD HERO: both flavours in frame, so there is no doubt what
          this is. Each is a 1:1 crop with its own name plate and spec stack
          beneath, laid out on a subgrid so the two columns stay aligned even
          though one caption wraps and the other does not.

          The circular 10g stamp that used to straddle the pair is gone —
          Emil's mockup replaces it with the per-flavour fiber plates, and
          keeping both put "10g fiber" on screen four times above the fold.

          The count badge is ABSOLUTELY POSITIONED over the media. That single
          mechanism satisfies both of Emil's rules at once: out of flow
          entirely, so an absent count leaves no reserved hole, AND an arriving
          count displaces nothing. Reserving a fixed-height row would have met
          the second rule by breaking the first.

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
                tone: 'berry',
                lcp: true,
              },
              {
                slug: 'flavor-maple-pecan',
                name: 'Maple Pecan',
                alt: 'Zuca maple pecan bites, rolled in toasted pecan and maple.',
                tone: 'maple',
                lcp: false,
              },
            ].map((f) => (
              <figure
                className="z-hero__product"
                data-tone={f.tone}
                key={f.slug}
              >
                <figcaption className="z-hero__product-name">{f.name}</figcaption>

                {/* Spec above the photo, per Emil's reference: the stack reads
                    as a labelled pack, name first, picture last. */}
                <ul className="z-hero__spec">
                  <li className="z-hero__spec-hero">10g fiber</li>
                  <li>150 kcal</li>
                  <li>4g protein</li>
                </ul>

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
                  {/* NEITHER image is lazy. They sit side by side in the hero,
                      so both are above the fold at every width in the test
                      matrix — 360 through 1280. loading="lazy" on the second was
                      left over from when the hero held one photo and the flavour
                      crops appeared only further down the page; it contradicted
                      the preload in index.html, which was cancelling it anyway.
                      Two directives disagreeing is worse than either alone, even
                      when the faster one happens to win.

                      fetchPriority stays on the first only: it is the LCP
                      candidate, and marking both high would have them compete. */}
                  <img
                    src={`/images/${f.slug}-360.jpg`}
                    width="640"
                    height="640"
                    alt={f.alt}
                    fetchPriority={f.lcp ? 'high' : undefined}
                    decoding={f.lcp ? 'sync' : 'async'}
                  />
                </picture>
              </figure>
            ))}

          </div>



          {/* THE COUNT IS NOW A FOCAL POINT, not a corner badge — it sits on
              the centre axis beneath the two stacks, where the reference slide
              puts it.
              It is in normal flow here, so it can no longer be both hole-free
              and reflow-free by being out of flow. The container therefore
              reserves its height: absent, that reads as breathing room on a
              centred poster rather than as a gap; present, nothing moves. */}
          <div
            className="z-hero__count"
            data-has-count={hasCount ? 'true' : 'false'}
          >
            {hasCount ? (
              <>
                <span className="z-hero__count-num">{count.toLocaleString()}</span>
                <span className="z-hero__count-word">{proof.liveLabel}</span>
              </>
            ) : (
              <p className="z-hero__count-fallback">{countFallback}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
