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
import { useEffect, useState } from 'react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import { ACTIVE_CTA, nutrition } from '../../content/copy.js';
import { PLATES } from './platePositions.js';

/* ONE artwork carrying both flavours, both sets of empty plates and all the
   botanicals, aligned to each other inside the file. The image is the CHROME;
   HTML supplies only the WORDS, positioned over the plate rectangles measured
   by scripts/measure-plates.mjs. Nothing here rebuilds a plate or a border. */
/* `detail` is the flavour box that used to be its own section further down the
   page. That section is deleted; the same photo and description now surface by
   TAPPING a flavour in the hero.
   ⚠️ NOT hover — a phone has no hover, and this is a mobile-first page. It is a
   disclosure button with aria-expanded, so it works by tap, by Enter/Space and
   by screen reader alike. */
const FLAVOURS = [
  {
    tone: 'berry',
    name: 'Chocolate Raspberry Sea Salt',
    detail: {
      slug: 'flavor-chocolate-raspberry',
      alt: 'Zuca chocolate raspberry sea salt bites, coated in freeze-dried raspberry powder.',
      body:
        'Tart raspberry against dark cocoa, finished with enough sea salt to keep it from being a dessert you get bored of.',
    },
  },
  {
    tone: 'maple',
    name: 'Maple Pecan',
    detail: {
      slug: 'flavor-maple-pecan',
      alt: 'Zuca maple pecan bites, rolled in toasted pecan and maple.',
      body: 'Toasted pecan and real maple. Warm, nutty, and gently sweet rather than sugary.',
    },
  },
];

// Nutrition figures on the plates carry no unit of their own, so the caption
// below the pair states it once for all of them. Ambiguous is one careless
// edit away from wrong — which is how "per bite" reached the sticky bar.
const CHIP_TEXT = ['150 kcal', '4g protein'];

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

/* The tap region for a flavour: the union of its four measured rectangles, so
   the whole stack is the target rather than a small chevron. Derived from the
   same measurements as the text, so it tracks a re-exported artwork instead of
   drifting off it. */
function unionBox(tone) {
  const rs = [PLATES[tone].name, PLATES[tone].pill, ...PLATES[tone].chips];
  const left = Math.min(...rs.map((r) => r.left));
  const top = Math.min(...rs.map((r) => r.top));
  const right = Math.max(...rs.map((r) => r.left + r.width));
  const bottom = Math.max(...rs.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

const LOGO_ALT =
  'Supported by Stanford Mussallem Center for Biodesign, Stanford Medicine, ' +
  'A Little Bird, Strike, Cooley, Cardinal Ventures, Step Change Innovations, ' +
  'Emergence, Stanford Center on Longevity Design Challenge, Vituity, and Burnette Foods.';

export default function Hero() {
  const [email, setEmail] = useState('');
  /* Which flavour's detail panel is open, or null. */
  const [open, setOpen] = useState(null);

  /* Escape closes it. A disclosure is not a modal — focus is not trapped and
     the page behind stays operable — but Escape is still the key everyone
     reaches for, and without it a keyboard user has to tab back to the
     trigger. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

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

              {/* The disclosure. Sits ABOVE the text overlays in the stacking
                  order and is the only thing in the figure that takes a
                  pointer event, so a tap anywhere on the stack opens it. */}
              <button
                type="button"
                className="z-hero__flavour-tap"
                style={box(unionBox(f.tone))}
                aria-expanded={open === f.tone}
                aria-controls={`flavour-detail-${f.tone}`}
                onClick={() => setOpen(open === f.tone ? null : f.tone)}
              >
                {/* The visible "+" is decorative; the button's accessible name
                    is this text, which says what tapping actually does. */}
                <span className="z-visually-hidden">{`About ${f.name}`}</span>
                <span className="z-hero__flavour-more" aria-hidden="true">
                  +
                </span>
              </button>
            </figure>
          );
        })}
      </div>

      {/* Sits in the band between the plates and the waitlist block, so the
          unit lands BELOW the numbers it qualifies rather than above them.
          ⚠️ Not decoration: the plates read "10G FIBER", "150 KCAL" and "4G
          PROTEIN" with no unit of their own, and unqualified figures beside a
          product are how "per bite" — wrong by five times — reached the sticky
          bar and three page titles. If it is ever cut again the unit has to
          move INTO the pill, not simply disappear.
          See .z-hero__serving in sections.css for why it gets its own row. */}
      <p className="z-hero__serving">{nutrition.serving}</p>

      {/* Detail panel.
          ⚠️ A DIRECT CHILD OF THE POSTER, ABSOLUTELY POSITIONED, WITH NO GRID
          PLACEMENT. That combination is what makes it inert: an abspos child of
          a grid container that sets no grid-row resolves against the container's
          padding box and takes no part in track sizing at all. Two earlier
          versions did move the page — a grid item spanning rows 3-5 shifted the
          artwork 70px, and anchoring to the artwork box drifted because the
          image OVERFLOWS its row at desktop (309px of image in a 208px track),
          so "a percentage of the artwork" means something different at every
          width. Poster percentages are width-independent because the rows are.
          Rendered only while open, so the photograph is never requested on
          first load and cannot touch LCP. */}
      {FLAVOURS.map((f) =>
        open === f.tone ? (
          <div
            className="z-hero__flavour-panel"
            id={`flavour-detail-${f.tone}`}
            key={f.tone}
            role="group"
            aria-label={f.name}
          >
            <picture>
              <source
                type="image/avif"
                srcSet={`/images/${f.detail.slug}-360.avif 360w, /images/${f.detail.slug}-640.avif 640w`}
                sizes="(min-width: 35em) 320px, 68vw"
              />
              <source
                type="image/webp"
                srcSet={`/images/${f.detail.slug}-360.webp 360w, /images/${f.detail.slug}-640.webp 640w`}
                sizes="(min-width: 35em) 320px, 68vw"
              />
              <img
                className="z-hero__flavour-photo"
                src={`/images/${f.detail.slug}-360.webp`}
                width="640"
                height="640"
                alt={f.detail.alt}
                decoding="async"
              />
            </picture>
            <p className="z-hero__flavour-name">{f.name}</p>
            <p className="z-hero__flavour-body">{f.detail.body}</p>
            <button
              type="button"
              className="z-hero__flavour-close"
              onClick={() => setOpen(null)}
              aria-label={`Close ${f.name}`}
            >
              {/* The glyph is decorative; aria-label carries the real name, so
                  a screen reader hears "Close Maple Pecan", not "times". */}
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null
      )}

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
