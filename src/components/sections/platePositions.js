/**
 * Plate rectangles inside the flavour-stack artwork, as percentages of each
 * image. GENERATED — do not hand-edit.
 *
 *   node scripts/measure-plates.mjs
 *
 * Measured programmatically rather than eyeballed, so the overlaid text tracks
 * the artwork at every viewport width and survives a re-export at a different
 * size. If the artwork changes, RE-RUN the script — the percentages shift even
 * when the layout looks identical, and stale ones slide the text off its plate.
 *
 * ⚠️ The artwork must ship with the plates EMPTY. A re-export on 17 Aug arrived
 * with the words baked into the plates; rendering the live overlay on top of it
 * prints every label twice, and dropping the overlay makes the words invisible
 * to a screen reader and unable to reflow. Empty plates are load-bearing.
 * The detection catches this: sampling a grid inside a filled plate returns
 * several colours instead of one.
 */
export const PLATES = {
  "berry": {
    "image": {
      "w": 606,
      "h": 634
    },
    "name": {
      "left": 28.05,
      "top": 0.63,
      "width": 45.54,
      "height": 23.82
    },
    "pill": {
      "left": 20.79,
      "top": 24.61,
      "width": 61.88,
      "height": 13.09
    },
    "chips": [
      {
        "left": 20.13,
        "top": 38.17,
        "width": 27.06,
        "height": 7.1
      },
      {
        "left": 47.69,
        "top": 38.17,
        "width": 35.64,
        "height": 7.1
      }
    ]
  },
  "maple": {
    "image": {
      "w": 657,
      "h": 671
    },
    "name": {
      "left": 38.05,
      "top": 0.6,
      "width": 43.38,
      "height": 23.25
    },
    "pill": {
      "left": 31.05,
      "top": 24.44,
      "width": 59.06,
      "height": 12.22
    },
    "chips": [
      {
        "left": 30.44,
        "top": 37.26,
        "width": 25.88,
        "height": 7
      },
      {
        "left": 56.62,
        "top": 37.26,
        "width": 34.09,
        "height": 7
      }
    ]
  }
};
