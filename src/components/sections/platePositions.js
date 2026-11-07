/**
 * Geometry of the hero flavour artwork (art-src/hero-flavours.png).
 *
 * Nov 2026: the artwork is now built from the three front labels Emil supplied
 * (Zuca_Front_Labels_*_Oct2026.pdf), cropped below the ZUCA wordmark and above
 * the net weight, and laid side by side. The labels carry their own words
 * (name, fiber, calories), so there is no text overlay to position any more;
 * these numbers only set the content inset.
 *
 * Each column is the span of that label's plates (x 244..754 of the 999px
 * label) as a percentage of the 1940px artwork. Regenerate them with the
 * artwork if the crop or the column pitch changes.
 */
export const PLATES = {
  image: { w: 1940, h: 837 },
  columns: {
    peanut: { left: 4.85, width: 26.29 },
    berry: { left: 36.8, width: 26.29 },
    maple: { left: 68.76, width: 26.29 },
  },
};
