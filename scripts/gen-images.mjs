/* ============================================================================
   Generates responsive AVIF / WebP / JPEG derivatives from the real product
   photography in /public. Source files are never modified.

   Run:  node scripts/gen-images.mjs
   Out:  public/images/<name>-<width>.<fmt>

   Art-direction notes baked in below:
   - The hero shows BOTH flavours as 1:1 crops, so the flavour crops double as
     the hero images. The old single-photo hero-bites 4:5 and 16:9 jobs were
     removed when the hero became product-forward; nothing referenced them.
   - maple-pecan.jpg was shot in a foil catering tray. The crop deliberately
     cuts the tray rim out of frame so the bites read as product, not catering.
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
    src: 'chocolate-raspberry.jpg',
    // Inset from the right and bottom edges, where the tray/wrapper is visible.
    extract: { left: 30, top: 30, width: 900, height: 900 },
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
     Step 4 of that strip was deliberately NOT imported: it is stock imagery,
     not Zuca's, and one panel shows a grain that reads as oats — an allergen we
     have not confirmed.
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
  {
    name: 'process-raspberry-powder',
    src: 'process-raspberry-powder.jpg',
    // Pushed right and down: the tray's ridged wall runs down the left edge and
    // across the top, and the bare tray floor is exposed in the lower right.
    // This window is the largest square of pure powder in the frame.
    extract: { left: 320, top: 430, width: 1020, height: 1020 },
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
    src: 'maple-pecan.jpg',
    // Crops out the foil tray rim (left edge + bottom) and the wood backdrop.
    extract: { left: 170, top: 80, width: 790, height: 790 },
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
  /* Hero comp assets. The two botanical clusters sit behind their own flavour
     stack and are ABOVE the fold, so they are kept deliberately small. The
     fruit clusters and the logo wall are below it. */
  /* Complete flavour stacks — plates, chips, photo, borders and botanicals all
     baked in, plates left EMPTY. Live text is overlaid on them using the plate
     rectangles measured by scripts/measure-plates.mjs. Above the fold, and the
     left one is the LCP element. */
  { name: 'hero-flavour-left', src: 'art-src/hero-flavour-left.png', widths: [340, 606] },
  { name: 'hero-flavour-right', src: 'art-src/hero-flavour-right.png', widths: [340, 657] },
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
      const pipeline = sharp(join(SRC, job.src))
        .extract(job.extract)
        .resize({ width: w, withoutEnlargement: true });
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
  for (const w of job.widths) {
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

console.table(report);
// The LCP element is the left-hand hero product. Keep the preload in
// index.html pointed at this exact slug and sizes.
const lcp = report.filter((r) => r.file.includes('flavor-chocolate-raspberry'));
console.log('LCP candidates:', JSON.stringify(lcp));
