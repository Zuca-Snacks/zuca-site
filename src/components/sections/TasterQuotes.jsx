/**
 * TasterQuotes — real taster reactions, as speech bubbles around the <h1>.
 *
 * Replaces the credential line above the headline and the "Two flavors, no
 * added sugar…" line below it. The <h1> itself is untouched: the page needs
 * exactly one and this is it.
 *
 * ⚠️ ALL FIVE SIT BELOW THE <h1>, NOT AROUND IT. They were split above and
 * below, which put the headline in the middle of the stack — and because the
 * headline and the quotes were both set in the display face at a similar size,
 * it read as a sixth quote rather than as the page's headline. The quotes are
 * now set in the BODY face, a step smaller: the display face is all-caps, so
 * using it here made speech look like more headlines. Sentence case is what
 * makes them read as people talking.
 *
 * ⚠️ THESE ARE REAL TESTIMONIALS — tasters at the Vituity symposium and
 * Stanford Demo Day. That is why they are <blockquote>, not styled <p>: a
 * screen reader should announce them as quotations from someone else, because
 * that is what they are. Do not restyle them into decorative text and do not
 * reword them; a testimonial that has been tidied up is no longer a testimonial.
 *
 * ⚠️ NO ATTRIBUTIONS. There is no <cite> and no "— Name, Title" line because we
 * do not have consented names. Inventing one, or inferring it from the event,
 * would be fabricating a person. If Emil supplies real names the markup already
 * has the slot: a <footer><cite> inside each blockquote.
 *
 * ⚠️ CLAIM GUARDRAIL: these are opinions about taste, held by the speaker, and
 * they stay that way. Do not add a linking sentence that converts a taster's
 * enthusiasm into a company claim, and do not add copy about fiber or health
 * next to them — an opinion beside a health claim reads as evidence for it.
 *
 * Built entirely in CSS and inline SVG, no images: the text stays live,
 * selectable, translatable and readable by a screen reader, and the section
 * adds no network requests at all.
 */
import { sections } from '../../content/copy.js';

/* ⚠️ ORDER IS LOAD-BEARING: two of these open "I can't believe", and Emil asked
   that they never sit next to each other. "How has no one thought of this
   before?" separates them. Do not re-sort this array. */
const QUOTES = [
  { text: 'Can’t. Stop. Eating them!!!', side: 'start' },
  { text: 'These are dangerously addictive.', side: 'end' },
  { text: 'I can’t believe this is upcycled fruit.', side: 'start' },
  { text: 'How has no one thought of this before?', side: 'end' },
  {
    text:
      'I can’t believe this is made from food that otherwise would have been thrown away.',
    side: 'start',
  },
];

/* Hand-drawn outline, used by the "marker" treatment.
   preserveAspectRatio="none" lets one path stretch to any quote length, and
   vector-effect="non-scaling-stroke" stops the stroke stretching with it — so a
   two-word quote and a two-line quote get the same weight of line. That is the
   whole reason this is an SVG and not a border-radius: a border cannot wobble.
   No fixed height anywhere; the frame is stretched by its box, not the reverse. */
function Frame() {
  return (
    <svg
      className="z-quote__frame"
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M14 8 C60 3 140 4 187 9 C194 10 197 16 196 30 C195 52 197 72 194 86
           C193 93 186 95 172 95 L60 96 C34 96 12 97 8 92 C4 86 3 60 4 36
           C5 16 6 10 14 8 Z"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* Red outline, amber fill, red, amber, red — by position in the column, so
   adding or reordering a quote keeps the alternation without anyone maintaining
   a colour by hand. See sections.css for why amber fills rather than outlines. */
const accentFor = (i) => (i % 2 === 0 ? 'red' : 'amber');

function Bubble({ q, i }) {
  return (
    <blockquote
      className="z-quote"
      data-side={q.side}
      data-i={i % 3}
      data-accent={accentFor(i)}
    >
      <Frame />
      {/* The <p> carries the quote. It is above the frame in stacking order so
          the outline can never sit over a letter. */}
      <p className="z-quote__text">{q.text}</p>
    </blockquote>
  );
}

export default function TasterQuotes() {
  return (
    <div className="z-quotes">
      {/* Confirmed copy (Emil, 18 Aug), now living in copy.js with the rest of
          the strings rather than hard-coded here. Rendered uppercase in CSS,
          stored in sentence case — an all-caps string can be spelled out letter
          by letter by a screen reader. */}
      <p className="z-quotes__eyebrow" id="quotes-eyebrow">
        {sections.quotes.eyebrow}
      </p>
      {/* A real group, named by the eyebrow, so a screen reader announces where
          the testimonials start and stop rather than running them together with
          the headline above. */}
      <div className="z-quotes__stack" role="group" aria-labelledby="quotes-eyebrow">
        {QUOTES.map((q, i) => (
          <Bubble q={q} i={i} key={i} />
        ))}
      </div>
    </div>
  );
}
