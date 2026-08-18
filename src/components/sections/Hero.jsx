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

/* The artwork is the CHROME — plates, chips, photo, borders and botanicals are
   all baked into the PNG, with the plates left empty. HTML supplies only the
   WORDS, positioned over the measured plate rectangles. Nothing here rebuilds a
   plate, a border or a chip in CSS; that is what kept failing. */
const FLAVOURS = [
  {
    tone: 'berry',
    slug: 'hero-flavour-left',
    widths: [340, 606],
    name: 'Chocolate Raspberry Sea Salt',
    lcp: true,
  },
  {
    tone: 'maple',
    slug: 'hero-flavour-right',
    widths: [340, 657],
    name: 'Maple Pecan',
    lcp: false,
  },
];

const CHIP_TEXT = ['150 kcal', '4g protein'];

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
      <div className="z-hero__poster">
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
        {FLAVOURS.map((f) => {
          const P = PLATES[f.tone];
          const [wSm, wLg] = f.widths;
          const set = (ext) =>
            `/images/${f.slug}-${wSm}.${ext} ${wSm}w, /images/${f.slug}-${wLg}.${ext} ${wLg}w`;
          return (
            <figure
              className="z-hero__product"
              data-tone={f.tone}
              key={f.tone}
              aria-label={f.name}
            >
              {/* alt="" — the artwork is decorative chrome. Every word it would
                  have carried is real text below, so describing it too would
                  read the flavour name twice. */}
              <picture>
                <source type="image/avif" srcSet={set('avif')} sizes="43vw" />
                <source type="image/webp" srcSet={set('webp')} sizes="43vw" />
                <img
                  src={`/images/${f.slug}-${wSm}.webp`}
                  width={P.image.w}
                  height={P.image.h}
                  alt=""
                  fetchPriority={f.lcp ? 'high' : undefined}
                  decoding={f.lcp ? 'sync' : 'async'}
                />
              </picture>

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
