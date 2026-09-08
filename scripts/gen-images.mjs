/* ============================================================================
   Generates responsive AVIF / WebP / JPEG derivatives from the real product
   photography in /public. Source files are never modified.

   Run:  node scripts/gen-images.mjs
   Out:  public/images/<name>-<width>.<fmt>

   A job's `src` is resolved inside public/ by default. Set `root: true` and the
   path is taken from the repo root instead — which is how the flavour masters
   live in art-src/ rather than public/, so the half-megabyte originals are
   never copied into the deploy. Same rule as ART below; the difference is that
   these are PHOTOGRAPHY and keep the photographic encoder settings.

   Art-direction notes baked in below:
   - The hero shows BOTH flavours as 1:1 crops, so the flavour crops double as
     the hero images. The old single-photo hero-bites 4:5 and 16:9 jobs were
     removed when the hero became product-forward; nothing referenced them.
   - Both flavour photos were RESHOT on 8 Sep 2026 and the crops rewritten with
     them; the tray-rim note that used to sit here described the retired August
     maple shot and no longer applies to anything in this file.
   ========================================================================== */

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SRC = 'public';
const OUT = 'public/images';
mkdirSync(OUT, { recursive: true });

const JOBS = [
  {
    name: 'flavor-chocolate-raspberry',
    /* RESHOT 8 Sep 2026. Supersedes the August photo entirely, which closes the
       grading episode recorded here before: that shot was colour-graded toward
       the hero tile on 18 Aug and Emil reverted it, because grading a real
       product photo toward artwork makes the food look more vivid on the site
       than it does in the box. That rule still stands and applies to this file
       too — NOTHING here may be graded toward the artwork. The retired camera
       original is kept as art-src/chocolate-raspberry-original.jpg; it is the
       old photo's reference, not this one's.

       CROP, measured rather than eyeballed. The bites form a seven-bite rosette
       on a field measured at exactly rgb(0,0,0). Subject bounding box spans the
       full frame width (x 0..1121) and y 54..1259 — so it is 1206px tall inside
       a frame only 1122px wide, and any full-width square crop would slice 84px
       off the cluster and flatten the top and bottom bites.

       This site's established crop judgement is to cut BACKGROUND and PROPS,
       never the product — the old crops cut a foil tray rim, not a bite. So
       rather than clip, the whole cluster is taken and padded out to square
       with the background colour sampled from the file itself — measured at
       exactly rgb(0,0,0) in all four corners, so the pad is seamless and no
       bite is cut. */
    root: true,
    src: 'art-src/raspberry-bites.jpg',
    extract: { left: 0, top: 54, width: 1122, height: 1206 },
    pad: { r: 0, g: 0, b: 0 },
    widths: [360, 640],
  },

  /* ── Process strip ────────────────────────────────────────────────────────
     Two real photographs from Emil's library. Both were checked against the
     allergen TODO before being brought into the repo: they show apple pulp and
     freeze-dried raspberry only — no oats, no dairy, no nuts in frame — so
     neither asserts an unconfirmed allergen in pixels. Both were shot in a
     disposable foil tray; the crops below are deliberately tight enough that
     the tray rim is outside the frame and only the material texture remains.
     The three remaining steps have no photograph and render as typographic
     placeholders — see ProcessStrip.jsx. ---------------------------------- */
  /* Steps 1 and 2, extracted from the process strip Emil sent. They are his
     own photographs and show apple pulp only — no unconfirmed allergen, no
     retail packaging. NOTE: these came out of a 1931px-wide composite, so the
     source tiles are ~240px and CANNOT be enlarged. They are generated at 240
     only and displayed small. Ask Emil for the camera originals to serve these
     at the same density as the rest of the strip.
     Step 4 of that strip was deliberately NOT imported. TWO reasons were given
     and only ONE of them still holds:
       ✅ STILL BLOCKING — it is stock imagery, not Zuca's.
       ❌ RETIRED 8 Sep 2026 — "one panel shows a grain that reads as oats, an
          allergen we have not confirmed." Oats are now a CONFIRMED ingredient in
          both flavours and the site states plainly that they are not certified
          gluten-free. The concern was never that oats look wrong; it was that
          the copy was silent, and it no longer is. Photography may show oats.
          See DECISIONS.md, 8 Sep 2026.
     So the oats objection must not be raised again against Zuca's own
     photography — but stock imagery is still not Zuca's product.
     Step 1 was imported and then WITHDRAWN: the pulp sits in a disposable foil
     catering pan, which the reshoot rules forbid because the FAQ asserts
     21 CFR 117 manufacturing. Do not re-add it from the strip.

     ── DO NOT IMPORT FROM ~/Desktop/zuca-comp (Emil, 17 Aug) ─────────────────
     The comp folder holds the deck mockups the redesign was built from. They
     are layout targets, NOT asset sources. Two things in them must never reach
     a build:

       1. The step-3 "ADD INGREDIENTS" tile shows a grain that reads as OATS,
          and the step-1 tile shows mixed-produce pulp rather than apple. Oats
          are on the unconfirmed list at the top of src/content/copy.js. A
          photograph asserts a claim exactly as effectively as a sentence does,
          so the allergen gate that governs the copy governs the picture too —
          same rule, same blocker, no separate sign-off.
       2. Every tile in those comps is stock imagery, not Zuca's own product,
          and the file names starting `alt-` and `ref-` are explicitly not
          layout targets — `alt-` are preserved alternatives Emil rejected,
          `ref-` are wide reference art.

     Only `hero-comp.png` and `comp-nutshell.png` are targets, and even those
     are compositions to build TOWARD, not files to slice. */
  {
    /* Step 1, replacing the withdrawn foil-tray shot. This one is a working
       juice bar — commercial press, apples waiting, pulp collecting in a lined
       bin — so it shows the supply chain rather than a domestic kitchen, which
       is what the reshoot rule was protecting. */
    name: 'process-pulp-collect',
    src: 'process-pulp-collect.png',
    extract: { left: 0, top: 0, width: 296, height: 296 },
    widths: [296],
  },
  {
    name: 'process-pulp-dried',
    src: 'process-pulp-dried.jpg',
    extract: { left: 0, top: 0, width: 240, height: 240 },
    widths: [240],
  },
  {
    name: 'process-pulp-milled',
    src: 'process-pulp-milled.jpg',
    // 1:1 from the centre; the foil rim runs around all four edges.
    extract: { left: 180, top: 520, width: 1180, height: 1180 },
    widths: [320, 560],
  },
  /* Founder portraits, extracted from the credentials artwork Emil sent. These
     replace the monogram placeholders — real faces are the highest-trust
     element the founders section can carry. */
  {
    name: 'founder-emil',
    src: 'founder-emil.png',
    extract: { left: 0, top: 0, width: 244, height: 244 },
    widths: [128, 244],
  },
  {
    name: 'founder-kelley',
    src: 'founder-kelley.png',
    extract: { left: 0, top: 0, width: 244, height: 244 },
    widths: [128, 244],
  },
  {
    name: 'flavor-maple-pecan',
    /* RESHOT 8 Sep 2026, replacing the foil-catering-tray shot. There is no
       tray and no wood backdrop left to crop out.

       CROP. Unlike the raspberry photo this one bleeds off all four edges —
       measured subject bounding box is y 32..1401 in a 1402px frame — so there
       is no whole cluster to preserve and the only real choice is which
       vertical window. Three were rendered and compared at the delivered size:
       top=0 leaves dead black wedges in the upper corners, top=280 crops in far
       enough to lose the rosette structure, and top=140 fills the frame edge to
       edge with the pecan-halved feature bite in the middle. 140 is also the
       geometric centre, but it was chosen by that comparison, not defaulted to. */
    root: true,
    src: 'art-src/maple-pecan-bites.jpg',
    extract: { left: 0, top: 140, width: 1122, height: 1122 },
    widths: [360, 640],
  },
];

/* Decorative artwork lives in art-src/, NOT public/, so the multi-hundred-KB
   originals are never copied into the deploy. Only the derivatives below ship.
   The first version of this referenced the raw 534KB PNG straight from public/
   and dropped Lighthouse performance from 98 to 81 with a 4.9s LCP. */
const ART = [
  { name: 'art-backdrop', src: 'art-src/art-ingredients-backdrop.png', widths: [600, 1600] },
  /* Section backgrounds. All render at low opacity behind content and all sit
     BELOW the fold, so they are encoded small and cheap — decoration must never
     compete with the LCP element for bandwidth. */
  { name: 'art-fruit-row', src: 'art-src/art-fruit-row.png', widths: [720] },
  /* "In a nutshell" section. Composed blocks with text and arrows baked in, so
     they carry a visually-hidden text equivalent in the markup — see
     Nutshell.jsx. All three are below the fold and lazy. */
  { name: 'nutshell-flow', src: 'art-src/nutshell-flow-wide.png', widths: [420, 780, 1090] },
  { name: 'process-steps', src: 'art-src/process-steps-wide.png', widths: [420, 780, 1107] },
  { name: 'problem-cycle', src: 'art-src/problem-cycle-wide.png', widths: [420, 780, 1114] },
  /* Hero comp assets. The two botanical clusters sit behind their own flavour
     stack and are ABOVE the fold, so they are kept deliberately small. The
     fruit clusters and the logo wall are below it. */
  /* Complete flavour stacks — plates, chips, photo, borders and botanicals all
     baked in, plates left EMPTY. Live text is overlaid on them using the plate
     rectangles measured by scripts/measure-plates.mjs. Above the fold, and the
     left one is the LCP element. */
  /* ONE combined artwork. Replaced the two separate stacks on 17 Aug: they are
     aligned to each other inside the file now, so they cannot drift apart. */
  /* ⚠️ 1560 IS INTENTIONAL AND CURRENTLY SKIPPED. The berry tile inside this
     artwork is 22.3% of its width, and a 430px phone at 3x needs that tile at
     289px — which needs the whole artwork at 1295px. Today's export is 1218px,
     giving the tile 272px: 94% of what is needed, already marginally soft.
     Emil is re-exporting at 1560px (tile lands at 348px, 20% headroom). The
     width is listed now so the variant appears the moment that file drops in;
     until then the upscale guard skips it and says so.
     ⚠️ When it does appear, add `/images/hero-flavours-1560.{avif,webp} 1560w`
     to BOTH source elements in Hero.jsx — the generator does not write srcsets. */
  { name: 'hero-flavours', src: 'art-src/hero-flavours.png', widths: [420, 780, 1218, 1560] },
  { name: 'hero-art-left', src: 'art-src/hero-art-left.png', widths: [340] },
  { name: 'hero-art-right', src: 'art-src/hero-art-right.png', widths: [340] },
  { name: 'hero-fruit-left', src: 'art-src/hero-fruit-left.png', widths: [340] },
  { name: 'hero-fruit-right', src: 'art-src/hero-fruit-right.png', widths: [360] },
  /* Supporter wall. Canva's SVG export was 21 embedded base64 PNGs — 99% of a
     670KB file, i.e. a raster in an SVG wrapper, 4.8x the flat PNG for no extra
     sharpness. The PNG is the correct source. */
  { name: 'logos-supported-by', src: 'art-src/logos-supported-by.png', widths: [640, 968] },
  { name: 'art-berries', src: 'art-src/art-berries.png', widths: [720] },
  { name: 'art-tree-growth', src: 'art-src/art-tree-growth.png', widths: [720] },
];

const FORMATS = [
  { ext: 'avif', fn: (p) => p.avif({ quality: 52, effort: 6 }) },
  { ext: 'webp', fn: (p) => p.webp({ quality: 74, effort: 5 }) },
  { ext: 'jpg', fn: (p) => p.jpeg({ quality: 78, progressive: true, mozjpeg: true }) },
];

const report = [];

for (const job of JOBS) {
  for (const w of job.widths) {
    for (const { ext, fn } of FORMATS) {
      const file = join(OUT, `${job.name}-${w}.${ext}`);
      /* `root` sources come from the repo root (art-src/), so a master never
         has to sit in public/ just to be reachable. */
      const pipeline = sharp(job.root ? job.src : join(SRC, job.src))
        .extract(job.extract);
      /* `pad` letterboxes the crop into a SQUARE of the target width using a
         background colour sampled from the source, so a subject that does not
         fit a 1:1 frame is kept whole instead of being sliced.

         ⚠️ It is done with fit:'contain' on the resize, NOT with sharp's
         .extend(). sharp applies .extend() AFTER the resize and in source
         pixels, so a 42px pad on a 1206px master stayed 42px on a 360px
         derivative and produced 444x387 — not square, and not the aspect ratio
         the markup reserves space for. fit:'contain' pads in OUTPUT pixels and
         is exact at every width. */
      pipeline.resize(
        job.pad
          ? { width: w, height: w, fit: 'contain', background: job.pad, withoutEnlargement: true }
          : { width: w, withoutEnlargement: true }
      );
      const info = await fn(pipeline).toFile(file);
      report.push({
        file: file.replace('public/', '/'),
        w: info.width,
        h: info.height,
        kb: +(info.size / 1024).toFixed(1),
      });
    }
  }
}

for (const job of ART) {
  /* ⚠️ NEVER UPSCALE. A width larger than the source produces a bigger file
     with no more detail, and it lands in the srcset where a high-DPR device
     will dutifully download it. Widths above the source are SKIPPED and
     announced, so a variant that was expected but is missing is visible here
     rather than as a 404 in the browser. */
  const srcMeta = await sharp(job.src).metadata();
  for (const w of job.widths) {
    if (w > srcMeta.width) {
      console.log(
        `  skip ${job.name}-${w}: source is only ${srcMeta.width}px wide. ` +
          `Re-export at >= ${w}px, then re-run and add the ${w}w entry to the srcset.`
      );
      continue;
    }
    for (const { ext, fn } of FORMATS) {
      if (ext === 'jpg') continue; // artwork ships AVIF/WebP only (needs alpha)
      const file = join(OUT, `${job.name}-${w}.${ext}`);
      // Lower quality than photography on purpose: this layer renders at low
      // opacity behind the hero, so detail is invisible but bytes are not.
      // The transparent master costs far more than the flattened one did —
      // a uniform white field compressed almost to nothing.
      const pipe = sharp(job.src).resize({ width: w });
      const enc = ext === 'avif'
        ? pipe.avif({ quality: 34, effort: 6 })
        : pipe.webp({ quality: 55, effort: 6, alphaQuality: 60 });
      const info = await enc.toFile(file);
      report.push({
        file: file.replace('public/', '/'),
        w: info.width,
        h: info.height,
        kb: +(info.size / 1024).toFixed(1),
      });
    }
  }
}

/* ── Social share card (og:image) ──────────────────────────────────────────────
   Until 8 Sep 2026 the site had NO og:image at all, so every shared link — every
   paid click that got forwarded, every Slack and iMessage paste — rendered as a
   text-only card.

   Composed here rather than exported from Canva so it cannot go stale against
   the product photography: it is built from the SAME two flavour crops the
   modals use, so a reshoot updates the share card in the same run.

   1200x630 is the size every unfurler crops toward, and JPEG is the format with
   no support gaps (several unfurlers still do not take AVIF or WebP). Deliberately
   NO TEXT baked in: the title and description tags carry the words, they are
   already claim-checked, and text rendered into an image cannot be corrected
   without a re-export or read by a screen reader.
   ⚠️ og:image must be an ABSOLUTE url — a relative path silently yields no
   image on most platforms. See index.html. */
const OG = { w: 1200, h: 630, tile: 460, gap: 60, bg: { r: 253, g: 224, b: 180 } };
{
  const left = Math.round((OG.w - (OG.tile * 2 + OG.gap)) / 2);
  const top = Math.round((OG.h - OG.tile) / 2);
  const radius = 36;
  const mask = Buffer.from(
    `<svg width="${OG.tile}" height="${OG.tile}"><rect width="${OG.tile}" height="${OG.tile}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );
  const tiles = await Promise.all(
    ['flavor-chocolate-raspberry', 'flavor-maple-pecan'].map((slug) =>
      sharp(join(OUT, `${slug}-640.jpg`))
        .resize(OG.tile, OG.tile)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer()
    )
  );
  const file = join(OUT, 'og-card-1200.jpg');
  const info = await sharp({
    create: { width: OG.w, height: OG.h, channels: 3, background: OG.bg },
  })
    .composite([
      { input: tiles[0], left, top },
      { input: tiles[1], left: left + OG.tile + OG.gap, top },
    ])
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(file);
  report.push({
    file: file.replace('public/', '/'),
    w: info.width,
    h: info.height,
    kb: +(info.size / 1024).toFixed(1),
  });
}

console.table(report);
/* The LCP element is the hero artwork, not a flavour photo. This used to filter
   on flavor-chocolate-raspberry and tell you to keep index.html's preload
   pointed at "this exact slug" — but the two flavour stacks were merged into one
   hero-flavours artwork on 17 Aug and the preload has pointed there ever since,
   so the instruction contradicted the markup it described. The flavour photos
   only load when a modal is opened and cannot be LCP candidates at all. */
const lcp = report.filter((r) => r.file.includes('hero-flavours'));
console.log('LCP candidates (must match the preload in index.html):', JSON.stringify(lcp));
