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
  {
    name: 'flavor-maple-pecan',
    src: 'maple-pecan.jpg',
    // Crops out the foil tray rim (left edge + bottom) and the wood backdrop.
    extract: { left: 170, top: 80, width: 790, height: 790 },
    widths: [360, 640],
  },
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

console.table(report);
// The LCP element is the left-hand hero product. Keep the preload in
// index.html pointed at this exact slug and sizes.
const lcp = report.filter((r) => r.file.includes('flavor-chocolate-raspberry'));
console.log('LCP candidates:', JSON.stringify(lcp));
