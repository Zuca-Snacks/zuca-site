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

/**
 * ⚠️ COPY OWNERSHIP — TEMPORARY DUPLICATE, DELETE ON MERGE.
 *
 * This is `introLines[0]` from the growth agent's `src/content/copy.js`,
 * reproduced verbatim. It is duplicated here ONLY because that file does not
 * exist on this branch, and creating it would collide with growth's own copy of
 * it (merge order is UX -> Conversion -> Security, so this branch lands first).
 *
 * When growth merges, this constant must be deleted and replaced with:
 *     import { introLines } from '../../content/copy.js';
 *     ...
 *     <p className="z-hero__tagline">{introLines[0].replace(/,$/, '')}</p>
 * so there is exactly one source of truth for copy. Tracked in HANDOFF-ux.md.
 *
 * The trailing comma is stripped because the line is used standalone here,
 * not as the first of three.
 */
const INTRO_LINE = 'A Michelin-trained chef and a Stanford physician,';

export default function Hero() {
  const [email, setEmail] = useState('');

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
          {/* Part of the brand entrance: fades up with the wordmark. */}
          <p className="z-hero__tagline">{INTRO_LINE.replace(/,$/, '')}</p>

          <div className="z-hero__eyebrow">
            <Badge variant="warm">Pre-order open</Badge>
            <Badge>10g fiber</Badge>
          </div>

          <h1 className="z-hero__title">
            Fiber you&rsquo;ll actually look forward to.
          </h1>

          <p className="z-hero__lede">
            Snack bites made from upcycled apple pulp. 10g of fiber, 150
            calories, no added sugar.
          </p>

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
                Join the waitlist
              </Button>
            </div>
            <p className="z-hero__microcopy">
              130+ people already pre-ordered. No payment today.
            </p>
          </form>
        </div>

        {/*
          Art-directed: phones get a dedicated 16:9 crop (~44KB AVIF), tablet and
          up get the 4:5 portrait. Without the split, a phone downloaded the full
          1024px-tall portrait and object-fit discarded two thirds of it.
          The matching <link rel=preload> lives in index.html — this <img> is
          rendered by React, so the browser's preload scanner cannot find it in
          the initial document on its own.
        */}
        <div className="z-hero__media">
          <picture>
            <source
              media="(max-width: 47.99em)"
              type="image/avif"
              srcSet="/images/hero-bites-wide-400.avif 400w, /images/hero-bites-wide-600.avif 600w, /images/hero-bites-wide-800.avif 800w"
              sizes="100vw"
            />
            <source
              media="(max-width: 47.99em)"
              type="image/webp"
              srcSet="/images/hero-bites-wide-400.webp 400w, /images/hero-bites-wide-600.webp 600w, /images/hero-bites-wide-800.webp 800w"
              sizes="100vw"
            />
            <source
              media="(max-width: 47.99em)"
              srcSet="/images/hero-bites-wide-400.jpg 400w, /images/hero-bites-wide-600.jpg 600w, /images/hero-bites-wide-800.jpg 800w"
              sizes="100vw"
            />
            <source
              type="image/avif"
              srcSet="/images/hero-bites-420.avif 420w, /images/hero-bites-640.avif 640w, /images/hero-bites-900.avif 820w"
              sizes="44vw"
            />
            <source
              type="image/webp"
              srcSet="/images/hero-bites-420.webp 420w, /images/hero-bites-640.webp 640w, /images/hero-bites-900.webp 820w"
              sizes="44vw"
            />
            {/* decoding="sync": this is the LCP element and it is already
                preloaded by the time React mounts, so deferring the decode only
                pushes the paint into a later frame. */}
            <img
              src="/images/hero-bites-640.jpg"
              width="820"
              height="1024"
              alt="A close crop of Zuca chocolate raspberry sea salt bites, dusted in freeze-dried raspberry."
              fetchPriority="high"
              decoding="sync"
            />
          </picture>
        </div>
      </div>
    </section>
  );
}
