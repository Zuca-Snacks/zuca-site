/* ============================================================================
   Measures the empty plate rectangles inside the combined flavour artwork so
   the live text can be positioned against them as PERCENTAGES of the image.

   ONE image now, not two: the flavours are aligned to each other inside the
   artwork, so they cannot drift apart in CSS. All eight targets — two name
   plates, two fiber pills, four chips — are found in the same pass and their
   percentages are relative to this single file.

   Why programmatically: hand-eyeballed coordinates drift the moment the artwork
   is re-exported at a different size, and the text silently slides off its
   plate. Percentages measured from the file itself track it at every width.

   ⚠️ Also verifies every plate is EMPTY. A re-export on 17 Aug arrived with the
   words baked in; a filled plate returns several colours from a grid sample, an
   empty one returns exactly one. Shipping a filled export prints each label
   twice or makes it invisible to a screen reader.

   Run:  node scripts/measure-plates.mjs
   ========================================================================== */
import sharp from 'sharp';

const FILE = 'art-src/hero-flavours.png';

const { data, info } = await sharp(FILE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const at = (x, y) => (y * W + x) * 4;
const hex = (x, y) => {
  const i = at(x, y);
  return '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
};

const isCream = (i) => data[i + 3] > 200 && data[i] > 225 && data[i] < 255 && data[i + 1] > 190 && data[i + 1] < 235 && data[i + 2] > 140 && data[i + 2] < 205;
const isBlack = (i) => data[i + 3] > 200 && data[i] < 55 && data[i + 1] < 55 && data[i + 2] < 55;
const isWhite = (i) => data[i + 3] > 200 && data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 235;

function components(test, minPx) {
  const seen = new Uint8Array(W * H);
  const out = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i]) continue;
    if (!test(i * 4)) { seen[i] = 1; continue; }
    let n = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    stack.length = 0; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (seen[q]) continue;
        seen[q] = 1;
        if (test(q * 4)) stack.push(q);
      }
    }
    if (n >= minPx) out.push({ n, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return out.sort((a, b) => b.n - a.n);
}

/* The pill touches the photo border, so a component search merges them. A solid
   black run wider than a fifth of the image only happens inside a pill. Scanned
   per half so the two pills are found separately. */
function pillIn(xa, xb) {
  const span = xb - xa;
  let pill = null;
  for (let y = 0; y < H * 0.5; y++) {
    let best = 0, bestStart = 0, cur = 0, curStart = 0;
    for (let x = xa; x < xb; x++) {
      if (isBlack(at(x, y))) { if (cur === 0) curStart = x; cur++; if (cur > best) { best = cur; bestStart = curStart; } }
      else cur = 0;
    }
    if (best > span * 0.5) {
      if (!pill) pill = { x: bestStart, y, w: best, h: 1 };
      else { pill.x = Math.min(pill.x, bestStart); pill.w = Math.max(pill.w, best); pill.h = y - pill.y + 1; }
    }
  }
  return pill;
}

/* PHOTO FRAME — the black rounded tile under the chips, which the live photo is
   overlaid onto so the card and the modal show the same file.

   Measured geometrically rather than by component search, because on the BERRY
   side the tile's border and the chips' outline are one connected black region
   (on the maple side they are separate). A flood fill from inside the tile
   therefore escapes upward through the chips and the badge and returns a box
   spanning most of the artwork — verified, it returns y 1..602.

   left/right come from a probe row deep inside the tile, below everything else.
   bottom is the lowest black pixel in the tile's centre column, found scanning
   UP from the bottom of the image — the centre column passes through the
   photograph, so scanning down would stop at the first non-black photo pixel.
   top is the highest row whose black run is CONTAINED WITHIN the tile's own
   x-bounds. The chips above are wider than the tile, so a row belonging to them
   spills past those bounds and is rejected. That containment test is the whole
   trick, and it is what separates the two on the berry side. */
function photoIn(xa, xb) {
  const probe = Math.round(H * 0.72);
  let left = null, right = null;
  for (let x = xa; x < xb; x++) if (isBlack(at(x, probe))) { if (left === null) left = x; right = x; }
  if (left === null) return null;

  const cx = Math.round((left + right) / 2);
  let bottom = null;
  for (let y = H - 1; y > probe; y--) if (isBlack(at(cx, y))) { bottom = y; break; }
  if (bottom === null) return null;

  let top = probe;
  for (let y = probe; y >= 0; y--) {
    let s = null, e = null;
    for (let x = xa; x < xb; x++) if (isBlack(at(x, y))) { if (s === null) s = x; e = x; }
    if (s === null) break;                     // clear gap above the tile (maple)
    if (s < left - 2 || e > right + 2) break;  // this row is the chips, not the tile (berry)
    top = y;
  }
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

const pct = (b) => ({
  left: +((100 * b.x) / W).toFixed(2),
  top: +((100 * b.y) / H).toFixed(2),
  width: +((100 * b.w) / W).toFixed(2),
  height: +((100 * b.h) / H).toFixed(2),
});

const mid = W / 2;
const cream = components(isCream, 3000).filter((b) => b.y < H * 0.4);
const white = components(isWhite, 800).filter((b) => b.w > W * 0.06 && b.h < H * 0.12);

const half = (arr, left) => arr.filter((b) => (b.x + b.w / 2 < mid) === left).sort((a, b) => a.x - b.x);

const plates = {
  berry: { name: half(cream, true)[0], pill: pillIn(0, mid), chips: half(white, true).slice(0, 2), photo: photoIn(0, mid) },
  maple: { name: half(cream, false)[0], pill: pillIn(mid, W), chips: half(white, false).slice(0, 2), photo: photoIn(mid, W) },
};

/* EMPTY-PLATE CHECK: a 9-point grid inside a plate returns one colour if empty. */
function emptyCheck(r) {
  const seen = new Set();
  for (const fx of [0.25, 0.5, 0.75]) for (const fy of [0.35, 0.5, 0.65]) {
    seen.add(hex(Math.round(r.x + r.w * fx), Math.round(r.y + r.h * fy)));
  }
  return [...seen];
}

let allEmpty = true;
const result = { image: { w: W, h: H } };
console.log(`--- hero-flavours.png (${W}x${H}) ---`);
for (const [tone, p] of Object.entries(plates)) {
  const entries = [['name', p.name], ['pill', p.pill], ['chip1', p.chips[0]], ['chip2', p.chips[1]]];
  result[tone] = { name: pct(p.name), pill: pct(p.pill), chips: p.chips.map(pct), photo: pct(p.photo) };
  console.log(
    `  ${tone} photo  ${String(p.photo.x).padStart(4)},${String(p.photo.y).padStart(3)} ${p.photo.w}x${p.photo.h} ` +
    `-> L${pct(p.photo).left} T${pct(p.photo).top} W${pct(p.photo).width} H${pct(p.photo).height} ` +
    `aspect ${(p.photo.w / p.photo.h).toFixed(3)}`
  );
  for (const [label, r] of entries) {
    const cols = emptyCheck(r);
    const ok = cols.length === 1;
    if (!ok) allEmpty = false;
    console.log(
      `  ${tone} ${label.padEnd(6)} ${String(r.x).padStart(4)},${String(r.y).padStart(3)} ${r.w}x${r.h}  ` +
      `-> L${pct(r).left} T${pct(r).top} W${pct(r).width} H${pct(r).height}  ` +
      (ok ? `EMPTY ${cols[0]}` : `⚠️ NOT EMPTY (${cols.length} colours)`)
    );
  }
}

/* Ink bounds of the whole artwork — the capture block is aligned to these, not
   to the file edges, so the field shares a column with the flavours. */
let lo = W, hi = 0, top = H, bot = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (data[at(x, y) + 3] > 12) { if (x < lo) lo = x; if (x > hi) hi = x; if (y < top) top = y; if (y > bot) bot = y; }
}
result.ink = {
  left: +((100 * lo) / W).toFixed(2),
  right: +((100 * (W - 1 - hi)) / W).toFixed(2),
  width: +((100 * (hi - lo + 1)) / W).toFixed(2),
};
console.log(`  ink bounds  x ${lo}-${hi}  margins left ${result.ink.left}% right ${result.ink.right}%  ink width ${result.ink.width}%`);
console.log(allEmpty ? '\n✅ all eight plates EMPTY' : '\n⚠️ SOME PLATES ARE FILLED — do not ship');
console.log('\nPLATES = ' + JSON.stringify(result, null, 2));
