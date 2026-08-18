/* ============================================================================
   Measures the empty plate rectangles inside the flavour-stack artwork so the
   live text can be positioned against them as PERCENTAGES of the image.

   Why programmatically: hand-eyeballed coordinates drift the moment the artwork
   is re-exported at a different size or with different padding, and the text
   silently slides off its plate. Percentages measured from the file itself
   track the image at every viewport width.

   Run:  node scripts/measure-plates.mjs
   Emits a JSON block to paste into Hero.jsx (or import).
   ========================================================================== */
import sharp from 'sharp';

const FILES = {
  berry: 'art-src/hero-flavour-left.png',
  maple: 'art-src/hero-flavour-right.png',
};

/** Connected-component bounding boxes for pixels passing `test`. */
function components(data, W, H, test, minPx) {
  const seen = new Uint8Array(W * H);
  const out = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i]) continue;
    const x0 = i % W;
    const y0 = (i / W) | 0;
    if (!test(data, (y0 * W + x0) * 4)) { seen[i] = 1; continue; }
    let n = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    stack.length = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      const y = (p / W) | 0;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (seen[q]) continue;
        seen[q] = 1;
        if (test(data, q * 4)) stack.push(q);
      }
    }
    if (n >= minPx) out.push({ n, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return out.sort((a, b) => b.n - a.n);
}

const isCream = (d, i) =>
  d[i + 3] > 200 && d[i] > 225 && d[i] < 255 && d[i + 1] > 190 && d[i + 1] < 235 && d[i + 2] > 140 && d[i + 2] < 205;
const isBlack = (d, i) => d[i + 3] > 200 && d[i] < 55 && d[i + 1] < 55 && d[i + 2] < 55;
const isWhite = (d, i) => d[i + 3] > 200 && d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 235;

const result = {};

for (const [tone, file] of Object.entries(FILES)) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const pct = (b) => ({
    left: +((100 * b.x) / W).toFixed(2),
    top: +((100 * b.y) / H).toFixed(2),
    width: +((100 * b.w) / W).toFixed(2),
    height: +((100 * b.h) / H).toFixed(2),
  });

  const cream = components(data, W, H, isCream, 3000);
  const white = components(data, W, H, isWhite, 800);

  // Name plate: the largest cream region in the upper half.
  const name = cream.filter((b) => b.y < H * 0.4)[0];

  /* Fiber pill by contiguous-run width, not by connected component: the pill
     touches the photo's black border, so a component search merges the two into
     one blob. A SOLID row of black wider than half the image only happens
     inside the pill — the photo border contributes two thin runs, not one wide
     one. */
  const widestRun = (y) => {
    let best = 0, bestStart = 0, cur = 0, curStart = 0;
    for (let x = 0; x < W; x++) {
      if (isBlack(data, (y * W + x) * 4)) {
        if (cur === 0) curStart = x;
        cur++;
        if (cur > best) { best = cur; bestStart = curStart; }
      } else cur = 0;
    }
    return { len: best, start: bestStart };
  };
  let pill = null;
  for (let y = 0; y < H * 0.5; y++) {
    const r = widestRun(y);
    if (r.len > W * 0.5) {
      if (!pill) pill = { x: r.start, y, w: r.len, h: 1 };
      else {
        pill.x = Math.min(pill.x, r.start);
        pill.w = Math.max(pill.w, r.len);
        pill.h = y - pill.y + 1;
      }
    }
  }
  // Chips: the two widest white regions, left-to-right.
  const chips = white.filter((b) => b.w > W * 0.15 && b.h < H * 0.12)
    .slice(0, 2)
    .sort((a, b) => a.x - b.x);

  result[tone] = {
    image: { w: W, h: H },
    name: name && pct(name),
    pill: pill && pct(pill),
    chips: chips.map(pct),
  };

  console.log(`--- ${tone} (${W}x${H}) ---`);
  console.log('  name plate', name ? `${name.x},${name.y} ${name.w}x${name.h}` : 'NOT FOUND', '->', name && pct(name));
  console.log('  fiber pill', pill ? `${pill.x},${pill.y} ${pill.w}x${pill.h}` : 'NOT FOUND', '->', pill && pct(pill));
  chips.forEach((c, i) => console.log(`  chip ${i + 1}   ${c.x},${c.y} ${c.w}x${c.h} ->`, pct(c)));
}

console.log('\nPLATES = ' + JSON.stringify(result, null, 2));
