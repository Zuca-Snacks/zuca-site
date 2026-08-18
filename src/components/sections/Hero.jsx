/**
 * Hero — a literal 1:1 build of hero-comp.png (Emil, 17 Aug: "Reset").
 *
 * ⚠️ THE FIRST SCREEN CONTAINS EXACTLY WHAT THE COMP CONTAINS, NOTHING ELSE:
 *   wordmark · two flavour stacks · JOIN THE WAITLIST · SUPPORTED BY + logo
 *   wall · fruit border.
 * No eyebrow, no credential tagline, no h1, no email label, no email field.
 * Those are not deleted — they moved into <HeroCapture>, immediately below the
 * fold. Adding anything back here is what broke the match three rounds running;
 * if something needs to be on the first screen it has to DISPLACE something the
 * comp draws, not stack on top of it.
 *
 * PROPORTIONS ARE THE POINT. The comp is 1170x2532 = exactly 390x844 at 3x, so
 * this section is exactly one viewport tall and every band is a fraction of that
 * height. The fr values in sections.css ARE the comp's measured percentages —
 * do not tidy them into round numbers.
 *
 * JOIN THE WAITLIST is a real control, not a caption: it scrolls to the capture
 * block and focuses the email field.
 */
import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import { ACTIVE_CTA } from '../../content/copy.js';
import { PLATES } from './platePositions.js';

/* ONE artwork carrying both flavours, both sets of empty plates and all the
   botanicals, aligned to each other inside the file. The image is the CHROME;
   HTML supplies only the WORDS, positioned over the plate rectangles measured
   by scripts/measure-plates.mjs. Nothing here rebuilds a plate or a border. */
const FLAVOURS = [
  { tone: 'berry', name: 'Chocolate Raspberry Sea Salt' },
  { tone: 'maple', name: 'Maple Pecan' },
];

const CHIP_TEXT = ['150 kcal', '4g protein'];

/* The artwork's visible CONTENT column — the span of the plates themselves,
   not the file edges and not the botanicals, which bleed. The capture block is
   aligned to this so the field sits in the same column as the flavours, and the
   inset is symmetric (the wider of the two margins) so it reads as centred. */
const RECTS = [
  PLATES.berry.name, PLATES.berry.pill, ...PLATES.berry.chips,
  PLATES.maple.name, PLATES.maple.pill, ...PLATES.maple.chips,
];
const CONTENT_INSET = Math.max(
  Math.min(...RECTS.map((r) => r.left)),
  100 - Math.max(...RECTS.map((r) => r.left + r.width))
);

/** Turns a measured rectangle into absolute positioning. */
const box = (r) => ({
  left: `${r.left}%`,
  top: `${r.top}%`,
  width: `${r.width}%`,
  height: `${r.height}%`,
});

const LOGO_ALT =
  'Supported by Stanford Mussallem Center for Biodesign, Stanford Medicine, ' +
  'A Little Bird, Strike, Cooley, Cardinal Ventures, Step Change Innovations, ' +
  'Emergence, Stanford Center on Longevity Design Challenge, Vituity, and Burnette Foods.';

export default function Hero() {
  const [email, setEmail] = useState('');

  /* Presentational shell — POSTs nowhere. Dispatches zuca:hero-email and hands
     off to growth's real form at #waitlist, which prefills from it. */
  function handleSubmit(e) {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent('zuca:hero-email', {
        detail: { email: email.trim().toLowerCase() },
      })
    );
    const target = document.getElementById('waitlist');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    }
  }

  return (
    <section className="z-hero" id="top">
      {/* The poster column. The composition was designed at phone width, so it
          is capped and centred rather than magnified — a desktop visitor sees
          the same poster, with cream either side, not a blown-up one. The art
          bleeds to the POSTER's edges, not the viewport's, which is why it
          lives in here. */}
      {/* --z-content-inset is the artwork's plate column, derived from the
          measured rectangles. Used to inset the capture block so it lines up
          with the flavours rather than bleeding to the screen edges. */}
      <div
        className="z-hero__poster"
        style={{ '--z-content-inset': `${CONTENT_INSET.toFixed(2)}%` }}
      >
        {/* No separate botanical layers: they are baked into the flavour-stack
            artwork. Keeping both loaded the same illustrations twice. */}
      <span className="z-hero__fruit z-hero__fruit--left" aria-hidden="true" />
      <span className="z-hero__fruit z-hero__fruit--right" aria-hidden="true" />

      <p className="z-hero__wordmark" role="img" aria-label="Zuca">
        {['Z', 'U', 'C', 'A'].map((letter, i) => (
          <span key={i} aria-hidden="true">
            {letter}
          </span>
        ))}
      </p>

      <div className="z-hero__products">
        {/* alt="" — the artwork is decorative chrome. Every word it carries is
            real text in the overlay, so describing it too would read each
            flavour twice. */}
        <picture>
          <source
            type="image/avif"
            srcSet="/images/hero-flavours-420.avif 420w, /images/hero-flavours-780.avif 780w, /images/hero-flavours-1218.avif 1218w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/images/hero-flavours-420.webp 420w, /images/hero-flavours-780.webp 780w, /images/hero-flavours-1218.webp 1218w"
            sizes="100vw"
          />
          <img
            className="z-hero__flavours"
            src="/images/hero-flavours-420.webp"
            width={PLATES.image.w}
            height={PLATES.image.h}
            alt=""
            fetchPriority="high"
            decoding="sync"
          />
        </picture>

        {FLAVOURS.map((f) => {
          const P = PLATES[f.tone];
          return (
            <figure className="z-hero__product" data-tone={f.tone} key={f.tone} aria-label={f.name}>
              <figcaption className="z-hero__plate-name" style={box(P.name)}>
                {f.name}
              </figcaption>
              <p className="z-hero__plate-fiber" style={box(P.pill)}>
                10g fiber
              </p>
              {P.chips.map((c, i) => (
                <p className="z-hero__plate-chip" style={box(c)} key={i}>
                  {CHIP_TEXT[i]}
                </p>
              ))}
            </figure>
          );
        })}
      </div>

      {/* A heading for the capture block, not a control — the field is on this
          screen now, so there is nothing to scroll to. Kept as a <p> rather
          than an <h2>: the page's only <h1> lives below the fold, and a heading
          here would sit before it and break the outline. */}
      <p className="z-hero__join" id="join-label">
        Join the waitlist
      </p>

      <form
        className="z-hero__capture"
        onSubmit={handleSubmit}
        aria-labelledby="join-label"
        noValidate
      >
        <label className="z-visually-hidden" htmlFor="hero-email">
          Email
        </label>
        <Input
          id="hero-email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" block>
          {ACTIVE_CTA.step1}
        </Button>
      </form>

      <p className="z-hero__supported">Supported by:</p>

      {/*
        One sprite, so one request. It is above the fold here — the composition
        wins, per Emil — but it carries loading=lazy and fetchpriority=low so it
        queues behind the two product photographs rather than competing with the
        LCP element.
      */}
      <picture className="z-hero__logos">
        <source
          type="image/avif"
          srcSet="/images/logos-supported-by-640.avif 640w, /images/logos-supported-by-968.avif 968w"
          sizes="92vw"
        />
        <source
          type="image/webp"
          srcSet="/images/logos-supported-by-640.webp 640w, /images/logos-supported-by-968.webp 968w"
          sizes="92vw"
        />
        <img
          src="/images/logos-supported-by-640.webp"
          width="968"
          height="304"
          alt={LOGO_ALT}
          loading="lazy"
          fetchPriority="low"
          decoding="async"
        />
      </picture>
      </div>
    </section>
  );
}
