# Canva export spec — one session, two files

Written 8 Sep 2026, after the flavour modals were updated to the new photography.

The two flavour **modals** now use the new photos and are done. The hero flavour
**cards** and the process strip's **Step 4** tile are not files the build can
touch — they are pixels baked inside two Canva exports. Those are what this spec
covers. Do both in one sitting; the 1560px hero re-export that has been on the
list since 18 Aug is folded in here rather than being a separate job.

Source photos, already copied into `art-src/`:

| Photo | File in `art-src/` | Size |
|---|---|---|
| Raspberry bites | `raspberry-bites.jpg` | 1122 × 1402 |
| Maple pecan bites | `maple-pecan-bites.jpg` | 1122 × 1402 |
| Step 4 split | `step4-shape-split.jpg` | 1122 × 1402 |

---

## FILE 1 — `hero-flavours.png`

The hero's two flavour stacks. This is the LCP element of the whole site, so it
is also the one worth getting sharp.

**Export as:** PNG, **transparent background**, **1560 × 859 px**

- Current export is 1218 × 671. 1560 × 859 is the same shape scaled up — the
  aspect ratio must stay **1.8152**, because the live text is positioned as
  percentages of this file and a different shape slides it off the plates.
- Why 1560 specifically: the berry photo tile is 22.3% of the artwork's width. A
  430px phone at 3× needs that tile at 289px, which needs the whole artwork at
  1295px. Today's 1218px export gives the tile 272px — 94% of what is needed,
  already marginally soft. 1560 puts the tile at 348px, about 20% headroom.
- `scripts/gen-images.mjs` already lists 1560 as a width and skips it with a
  message until a large enough file appears. Nothing needs changing to accept it.

**Swap these two regions, and nothing else:**

| Region | Approx. position in the artwork | Replace with |
|---|---|---|
| LEFT stack photo tile | ~15–37% across, ~43–89% down | `raspberry-bites.jpg` |
| RIGHT stack photo tile | ~67–90% across, ~43–89% down | `maple-pecan-bites.jpg` |

The tiles are the rounded-corner photo squares below each stack's white plates.
Keep their rounded corners and their positions; only the photograph inside
changes.

### ⚠️ Two things that will silently break the page

1. **The plates must be EMPTY.** The cream box at the top of each stack, the
   white pill, and the two white chips carry no text in the file — the live page
   draws that text over them so a screen reader can read it and so it reflows.
   A re-export arrived on 17 Aug with the words baked in; that prints every
   label twice. `scripts/measure-plates.mjs` grid-samples each plate and refuses
   to vouch for a filled one, so this is caught, but only if it is run.
2. **Do not move, resize or re-space anything else.** Plate positions are
   measured from the file and stored in `platePositions.js`. They are re-measured
   after a re-export, so a small shift is survivable — but the closer the layout
   stays, the less there is to verify.

---

## FILE 2 — `process-steps-wide.png`

The four-step "We upcycle fruit pulp into fiber-packed snacks" strip.

**Export as:** PNG, transparent background, **1107 × 641 px** (unchanged)

**Swap one region:**

| Region | Approx. position | Replace with |
|---|---|---|
| STEP 4 tile (rightmost) | ~77–99% across, ~51–91% down | `step4-shape-split.jpg` |

The existing Step 4 tile is already a vertical 50/50 split — maple on top,
raspberry below — and `step4-shape-split.jpg` is composed the same way, so it
drops straight in. The existing tile is roughly 234 × 253 (about 0.93 wide-to-
tall) while the new photo is 0.80, so it needs a little cropping top and bottom
in Canva to fill the same slot.

The heading text baked into this file carries no nutrition numbers, so nothing
in it went stale with the macro change. Leave it as it is.

**Optional, only because you are already in the file:** exporting this at
**1600 × 926** instead would let the strip render sharply on a 2× desktop. It is
displayed up to 736px wide, so a 2× screen wants 1472px and the current 1107px
export is genuinely soft there. Costs a few tens of KB for 2× users. Say the
word and the extra width gets added to the pipeline; skip it and nothing breaks.

---

## What happens after you drop the files in

Overwrite the two files in `art-src/` with the same filenames, then this side:

```
node scripts/measure-plates.mjs     # re-measures the plates, rewrites platePositions.js
node scripts/gen-images.mjs         # regenerates every derivative
npm run audit:hero                  # confirms the hero rows still fit
```

Then two hand edits that the generator cannot do, both needed for the 1560
variant to actually be used:

1. `src/components/sections/Hero.jsx` — add
   `/images/hero-flavours-1560.{avif,webp} 1560w` to **both** `<source>`
   elements for the hero artwork.
2. `index.html` — add `/images/hero-flavours-1560.avif 1560w` to the LCP
   preload's `imagesrcset`. This one is easy to miss: the preload is a separate
   copy of the srcset, and if it goes stale the browser downloads a file nobody
   uses *and* the real LCP image stops being discoverable early.
