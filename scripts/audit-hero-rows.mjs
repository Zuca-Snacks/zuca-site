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

   Four independent checks, because any one can pass while another fails:
     1. ROW FIT        — does any in-flow grid child exceed its own track?
     2. PAIR OVERLAP   — do any two hero elements share screen space?
     3. FOLD CLEARANCE — how much room is left under the CTA?
     4. POSTER FIT     — is anything being clipped by the poster's overflow?

   ⚠️ CLEARANCE IS A NUMBER, NOT A YES/NO. It was 21px at 360 on the merged
   branch (18 Aug) — "above the fold" was true, and one copy edit from false. A
   binary check reports that as healthy right up until the moment it isn't, so
   the gate is a floor and the actual number is printed at every viewport.
   360 IS THE WIDTH THAT DECIDES IT. It is the tightest we support and always
   the first to fail; 390 and 430 have consistently had 2-3x the room. Never
   judge fold safety from a 390 screenshot.

   ⚠️ CHECK 4 EXISTS BECAUSE CHECK 1 CANNOT CATCH THIS ANY MORE. Content rows
   are min-content, so by definition each one fits its own content — row fit can
   no longer detect "too much stuff". The failure mode MOVED rather than
   vanished: as content grows the fr gaps collapse to zero, and after that the
   poster (overflow: hidden, height 100svh) silently CLIPS from the bottom. The
   logo card is what disappears first, and it disappears without overlapping
   anything, so checks 1-3 all stay green. This check is the one that fails.

   Short viewports are included deliberately: 844 is a simulator, and every one
   of these bugs measured clean there. 640-760 is where real phones live once
   browser chrome is counted.

   Run:  npm run audit:hero        (needs `npm run preview` on :4173)
   ========================================================================== */
import { chromium } from 'playwright';

const URL = process.env.ZUCA_URL ?? 'http://localhost:4173/';

/* Hard floor: below this the build fails. A line of body copy is ~22px, so
   anything under this is less than one wrapped line from falling off. */
const MIN_CLEARANCE = 24;

/* Comfort line: printed as a warning, does not fail. This is the number to aim
   at when there is height to spare. */
const WANT_CLEARANCE = 48;

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
const tight = [];

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

    /* Is the poster clipping anything? Compare the bottom of its last in-flow
       child against the poster's own box. `overflow: hidden` means this fails
       silently and invisibly — nothing overlaps, content simply stops existing. */
    let lowest = posterBox.top;
    let lowestName = '';
    for (const el of poster.children) {
      if (getComputedStyle(el).position === 'absolute') continue;
      const b = el.getBoundingClientRect();
      if (b.bottom > lowest) {
        lowest = b.bottom;
        lowestName = el.className.toString().split(' ')[0] || el.tagName.toLowerCase();
      }
    }
    return {
      overflows,
      clashes,
      ctaBottom: Math.round(cta.bottom),
      clipped: Math.round(Math.max(0, lowest - posterBox.bottom)),
      clippedName: lowestName,
    };
  }, ELEMENTS);

  const clearance = h - result.ctaBottom;
  const ok =
    !result.overflows.length &&
    !result.clashes.length &&
    !result.clipped &&
    clearance >= MIN_CLEARANCE;
  if (!ok) failures++;
  if (ok && clearance < WANT_CLEARANCE) tight.push(`${w}x${h} (${clearance}px)`);

  const note =
    clearance < 0
      ? `  *** CTA IS BELOW THE FOLD by ${-clearance}px ***`
      : clearance < MIN_CLEARANCE
        ? `  *** CLEARANCE ${clearance}px IS UNDER THE ${MIN_CLEARANCE}px FLOOR ***`
        : clearance < WANT_CLEARANCE
          ? `  tight — ${clearance}px, want ${WANT_CLEARANCE}`
          : '';

  console.log(
    `${ok ? '  ok  ' : ' FAIL '}${String(w) + 'x' + h}`.padEnd(20) +
      `CTA ${result.ctaBottom}/${h}  clearance ${String(clearance).padStart(4)}px${note}`
  );
  for (const o of result.overflows) {
    console.log(`         row ${o.row} ${o.name} OVERFLOWS ITS TRACK BY ${o.over}px`);
  }
  for (const c of result.clashes) console.log(`         OVERLAP ${c}`);
  if (result.clipped) {
    console.log(
      `         *** ${result.clippedName} IS CLIPPED BY ${result.clipped}px — the poster ` +
        `has run out of height and is cutting content off the bottom ***`
    );
  }

  await page.close();
}

await browser.close();

if (failures) {
  console.log(
    `\n${failures} viewport(s) FAILED. Either a content row has been given a fraction, ` +
      `an element has outgrown its track, the CTA has dropped under the ${MIN_CLEARANCE}px fold ` +
      `floor, or the poster is clipping content off the bottom.`
  );
} else {
  console.log(
    `\nAll ${VIEWPORTS.length} viewports pass: every row fits its content, nothing overlaps, ` +
      `CTA clears the fold by at least ${MIN_CLEARANCE}px.`
  );
  if (tight.length) {
    console.log(
      `\n⚠️  TIGHT, not failing — under the ${WANT_CLEARANCE}px comfort line at: ${tight.join(', ')}.\n` +
        `   There is no room here for a longer headline or an extra line of copy. ` +
        `Re-run this before shipping any copy change.`
    );
  }
}
process.exit(failures ? 1 : 0);
