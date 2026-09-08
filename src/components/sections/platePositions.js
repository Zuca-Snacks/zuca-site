/**
 * Plate rectangles inside hero-flavours.png, as percentages of that ONE image.
 * GENERATED — do not hand-edit.
 *
 *   node scripts/measure-plates.mjs
 *
 * The two flavours are aligned to each other inside the artwork, so they cannot
 * drift apart in CSS — that alignment problem is gone at the source. All eight
 * targets are measured in one pass and are relative to this single file.
 *
 * `photo` is the black rounded tile each flavour's photograph sits in. The live
 * <picture> is positioned onto that rectangle so the card and the flavour modal
 * show the SAME derivative and cannot drift apart. Measured geometrically, not
 * by component search — on the berry side the tile's border and the chips'
 * outline are one connected black region. See scripts/measure-plates.mjs.
 *
 * `ink` is the artwork's true horizontal extent, which is NOT the file edges.
 * The capture block below the artwork is sized to it so the email field shares
 * a column with the flavours rather than with the transparent padding.
 *
 * ⚠️ The plates must ship EMPTY. A re-export on 17 Aug arrived with the words
 * baked in; the overlay would then print every label twice, and dropping the
 * overlay would make them invisible to a screen reader and unable to reflow.
 * The script grid-samples each plate and refuses to vouch for a filled one.
 */
export const PLATES = {
  "image": {
    "w": 1218,
    "h": 671
  },
  "berry": {
    "name": {
      "left": 13.96,
      "top": 0.6,
      "width": 22.66,
      "height": 22.5
    },
    "pill": {
      "left": 10.34,
      "top": 23.25,
      "width": 30.79,
      "height": 12.37
    },
    "chips": [
      {
        "left": 10.02,
        "top": 36.07,
        "width": 13.46,
        "height": 6.71
      },
      {
        "left": 23.73,
        "top": 36.07,
        "width": 17.73,
        "height": 6.71
      }
    ],
    "photo": {
      "left": 14.12,
      "top": 43.37,
      "width": 22.33,
      "height": 46.5
    }
  },
  "maple": {
    "name": {
      "left": 66.58,
      "top": 0.6,
      "width": 23.48,
      "height": 23.25
    },
    "pill": {
      "left": 62.89,
      "top": 24.44,
      "width": 31.86,
      "height": 12.22
    },
    "chips": [
      {
        "left": 62.48,
        "top": 37.26,
        "width": 14.04,
        "height": 7
      },
      {
        "left": 76.68,
        "top": 37.26,
        "width": 18.39,
        "height": 7
      }
    ],
    "photo": {
      "left": 66.75,
      "top": 44.86,
      "width": 22.99,
      "height": 45.16
    }
  },
  "ink": {
    "left": 0,
    "right": 1.07,
    "width": 98.93
  }
};
