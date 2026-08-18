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
  berry: { name: half(cream, true)[0], pill: pillIn(0, mid), chips: half(white, true).slice(0, 2) },
  maple: { name: half(cream, false)[0], pill: pillIn(mid, W), chips: half(white, false).slice(0, 2) },
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
  result[tone] = { name: pct(p.name), pill: pct(p.pill), chips: p.chips.map(pct) };
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
