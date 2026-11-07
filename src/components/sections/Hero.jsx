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
import { ACTIVE_CTA, nutrition } from '../../content/copy.js';
import { PLATES } from './platePositions.js';

/* ONE artwork carrying all three flavours, built from the front labels
   (Nov 2026). The labels carry their own words, so the image is the content,
   not chrome, and its alt text carries every figure on it.
   The tap-to-open flavour panels were removed (Lars, 7 Nov 2026): the panel
   photo was the same photo already on each label, so the "+" promised
   nothing new. Taste descriptions live in the FAQ. */
const HERO_ALT =
  'Zuca in three flavours, each 16g fiber per serving: Peanut Cookie Dough, 170 kcal; ' +
  'Chocolate Raspberry Sea Salt, 160 kcal; Maple Butter Pecan, 180 kcal.';

/* The waitlist block's hand-drawn plate — the chosen treatment (Emil, 18 Aug).
   It is the SAME DEVICE the flavour artwork uses for its name plates, which is
   the point: the destination is built out of the poster's own vocabulary rather
   than dropped on top of it as a generic card. The rejected alternative (a
   marker rule under the heading with an arrow curving to the field) was deleted
   rather than left behind a flag — it lost against artwork this busy.

   Same technique as the quote frames: one path stretched by its box, with a
   non-scaling stroke so the line keeps its weight whatever the block's size. */
function PlateFrame() {
  return (
    <svg
      className="z-hero__plate-frame"
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 7 C58 2 142 3 188 8 C195 9 197 15 196 28 C195 51 197 74 193 88
           C192 94 185 96 170 96 L58 97 C33 97 11 98 7 93 C3 86 3 58 4 34
           C5 14 5 9 12 7 Z"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* Marker underline beneath JOIN THE WAITLIST, and the arrow that carries the
   eye from the heading down to the field. Both decorative. */
/* The artwork's visible CONTENT column — the span of the plates themselves,
   not the file edges and not the botanicals, which bleed. The capture block is
   aligned to this so the field sits in the same column as the flavours, and the
   inset is symmetric (the wider of the two margins) so it reads as centred. */
const COLS = Object.values(PLATES.columns);
const CONTENT_INSET = Math.max(
  Math.min(...COLS.map((c) => c.left)),
  100 - Math.max(...COLS.map((c) => c.left + c.width))
);

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
        {/* The labels' words are part of the artwork now, so the image carries
            them in its alt text. */}
        <picture>
          <source
            type="image/avif"
            srcSet="/images/hero-flavours-420.avif 420w, /images/hero-flavours-780.avif 780w, /images/hero-flavours-1218.avif 1218w, /images/hero-flavours-1560.avif 1560w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/images/hero-flavours-420.webp 420w, /images/hero-flavours-780.webp 780w, /images/hero-flavours-1218.webp 1218w, /images/hero-flavours-1560.webp 1560w"
            sizes="100vw"
          />
          <img
            className="z-hero__flavours"
            src="/images/hero-flavours-420.webp"
            width={PLATES.image.w}
            height={PLATES.image.h}
            alt={HERO_ALT}
            fetchPriority="high"
            decoding="sync"
          />
        </picture>

      </div>

      {/* Sits in the band between the plates and the waitlist block, so the
          unit lands BELOW the numbers it qualifies rather than above them.
          ⚠️ Not decoration: the labels read "16G FIBER" and a calorie figure
          with no unit of their own, and unqualified figures beside a
          product are how "per bite" — wrong by five times — reached the sticky
          bar and three page titles. If it is ever cut again the unit has to
          move INTO the pill, not simply disappear.
          See .z-hero__serving in sections.css for why it gets its own row. */}
      <p className="z-hero__serving">{nutrition.serving}</p>

      {/* ⚠️ ONE ROW, IN FLOW: field, button, SUPPORTED BY and the logo card.
          They were four fixed-fraction grid rows, and anything taller than its
          share drew on top of the row below — which is how SUPPORTED BY ended
          up behind the button on any phone shorter than ~760px. See
          grid-template-rows in sections.css. */}
      <div className="z-hero__lower">
        <div className="z-hero__capture-group">
          <PlateFrame />
          {/* ⚠️ IN FLOW, directly above the field. As its own fixed-fraction
              grid row it overflowed and drew on top of the email box. Kept as a
              <p> rather than an <h2>: the page's only <h1> lives below the fold
              and a heading here would sit before it and break the outline. */}
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
            <Button type="submit">
              {ACTIVE_CTA.step1}
            </Button>
          </form>

        </div>

        {/* A SIBLING of the capture group, not a child: the gap that separates
            it from the button is the lower stack's gap, which is deliberately
            larger than the JOIN -> field gap inside the group. "Separate
            blocks, not one stack." */}
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
      </div>
    </section>
  );
}
