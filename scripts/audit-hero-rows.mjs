/* ============================================================================
   HERO LAYOUT AUDIT — guards against the overflowing-row fault.

   WHY THIS EXISTS
   The hero poster is a fixed-height grid. For a long time every row was
   minmax(0, Nfr) — a fixed fraction of the VIEWPORT, with no relationship to
   what it held. An element taller than its share does not expand the row; it
   silently overflows and paints on top of whatever is underneath.

   On 17-18 Aug an audit found FOUR of five rows overflowing:
       wordmark    +3px     -> into a gap, invisible
       artwork     +101px   -> into gaps, invisible (desktop)
       JOIN        +7..9px  -> into the capture block, VISIBLE
       lower stack +45px    -> desktop
   Three were harmless only because they happened to land in gap rows. That is
   the dangerous part: the fault was already present in three places and only
   announced itself in one, on short viewports, on a real phone.

   THE MODEL THAT FIXES IT, and that this script defends:
       CONTENT rows are min-content.  GAP rows are minmax(0, Nfr).
   A content row is exactly as tall as its content and cannot be overlapped.
   The fr gaps absorb the slack in the comp's proportions, so the composition
   survives. On a viewport too short for both, gaps collapse to zero before
   anything overlaps.

   ⚠️ If you ever change a content row back to a fraction to fix spacing, this
   script is how you will find out what it broke. Change a GAP instead.

   Two independent checks, because either can pass while the other fails:
     1. ROW FIT      — does any in-flow grid child exceed its own track?
     2. PAIR OVERLAP — do any two hero elements share screen space?

   Short viewports are included deliberately: 844 is a simulator, and every one
   of these bugs measured clean there. 640-760 is where real phones live once
   browser chrome is counted.

   Run:  npm run audit:hero        (needs `npm run preview` on :4173)
   ========================================================================== */
import { chromium } from 'playwright';

const URL = process.env.ZUCA_URL ?? 'http://localhost:4173/';

const VIEWPORTS = [
  [360, 844], [390, 844], [390, 800], [390, 760],
  [390, 700], [390, 640], [430, 932], [768, 1024], [1280, 900],
];

/* Everything that must never overlap anything else. */
const ELEMENTS = [
  '.z-hero__wordmark',
  '.z-hero__flavours',
  '.z-hero__join',
  '.z-hero__capture input',
  '.z-hero__capture button',
  '.z-hero__supported',
  '.z-hero__logos',
];

const browser = await chromium.launch();
let failures = 0;

for (const [w, h] of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: w < 768,
    hasTouch: w < 768,
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  /* ⚠️ Do NOT wait on every image: below-fold images are loading="lazy" and
     never fire, which hangs the run. That cost two rounds of "1280 hangs"
     before it was diagnosed. */
  await page.waitForTimeout(800);

  const result = await page.evaluate((sel) => {
    const poster = document.querySelector('.z-hero__poster');
    const rowHeights = getComputedStyle(poster).gridTemplateRows.split(' ').map(parseFloat);
    const posterBox = poster.getBoundingClientRect();

    let y = posterBox.top;
    const tracks = rowHeights.map((height) => {
      const t = { top: y, bottom: y + height };
      y += height;
      return t;
    });

    const overflows = [];
    for (const el of poster.children) {
      const cs = getComputedStyle(el);
      /* Absolutely positioned children take no part in track sizing, so they
         cannot overflow a row by definition — skip them. */
      if (cs.position === 'absolute') continue;
      const rowIndex = parseInt(cs.gridRowStart, 10);
      if (Number.isNaN(rowIndex)) continue;
      const track = tracks[rowIndex - 1];
      if (!track) continue;
      const box = el.getBoundingClientRect();
      const over = Math.round(
        Math.max(0, track.top - box.top) + Math.max(0, box.bottom - track.bottom)
      );
      if (over > 0) {
        overflows.push({
          name: el.className.toString().split(' ')[0] || el.tagName.toLowerCase(),
          row: rowIndex,
          over,
        });
      }
    }

    const boxes = sel
      .map((s) => {
        const el = document.querySelector(s);
        return el ? { s, b: el.getBoundingClientRect() } : null;
      })
      .filter(Boolean);

    const clashes = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i].b;
        const B = boxes[j].b;
        const apart =
          A.bottom <= B.top || B.bottom <= A.top || A.right <= B.left || B.right <= A.left;
        if (!apart) {
          clashes.push(
            `${boxes[i].s} ↔ ${boxes[j].s} (${Math.round(
              Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top)
            )}px)`
          );
        }
      }
    }

    const cta = document.querySelector('.z-hero__capture button').getBoundingClientRect();
    return { overflows, clashes, ctaBottom: Math.round(cta.bottom) };
  }, ELEMENTS);

  const ctaAboveFold = result.ctaBottom < h;
  const ok = !result.overflows.length && !result.clashes.length && ctaAboveFold;
  if (!ok) failures++;

  console.log(
    `${ok ? '  ok  ' : ' FAIL '}${String(w) + 'x' + h}`.padEnd(20) +
      `CTA ${result.ctaBottom}/${h}${ctaAboveFold ? '' : '  *** BELOW FOLD ***'}`
  );
  for (const o of result.overflows) {
    console.log(`         row ${o.row} ${o.name} OVERFLOWS ITS TRACK BY ${o.over}px`);
  }
  for (const c of result.clashes) console.log(`         OVERLAP ${c}`);

  await page.close();
}

await browser.close();

console.log(
  failures
    ? `\n${failures} viewport(s) FAILED — see above. A content row has been given a fraction, or an element has outgrown its track.`
    : `\nAll ${VIEWPORTS.length} viewports clean: every row fits its content, nothing overlaps, CTA above the fold.`
);
process.exit(failures ? 1 : 0);
