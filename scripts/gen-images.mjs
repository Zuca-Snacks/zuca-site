/* ============================================================================
   Generates responsive AVIF / WebP / JPEG derivatives from the real product
   photography in /public. Source files are never modified.

   Run:  node scripts/gen-images.mjs
   Out:  public/images/<name>-<width>.<fmt>

   Art-direction notes baked in below:
   - chocolate-raspberry.jpg is edge-to-edge product and crops well as-is.
     A 4:5 portrait crop is used for the hero (best fit for a phone fold).
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
    // Desktop / tablet: 4:5 portrait pulled from the centre of the square frame.
    name: 'hero-bites',
    src: 'chocolate-raspberry.jpg',
    extract: { left: 102, top: 0, width: 820, height: 1024 },
    widths: [420, 640, 900],
  },
  {
    // Phone: a dedicated 16:9 crop. Without this the phone downloads the full
    // 4:5 file (1024px tall) and object-fit throws away two thirds of it —
    // Lighthouse measured 83KB of that as pure waste.
    name: 'hero-bites-wide',
    src: 'chocolate-raspberry.jpg',
    extract: { left: 0, top: 224, width: 1024, height: 576 },
    widths: [400, 600, 800],
  },
  {
    name: 'flavor-chocolate-raspberry',
    src: 'chocolate-raspberry.jpg',
    // Inset from the right and bottom edges, where the tray/wrapper is visible.
    extract: { left: 30, top: 30, width: 900, height: 900 },
    widths: [360, 640],
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
const heroLcp = report.filter((r) => r.file.includes('hero-bites-900'));
console.log('LCP candidates (900w):', JSON.stringify(heroLcp));
