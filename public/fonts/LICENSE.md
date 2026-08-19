# Font licences

Both faces in this directory are self-hosted and served from our own origin. Neither
is loaded from a third-party CDN.

## lazydog-latin.woff2

- **Font:** Lazydog Kids Font
- **Foundry:** JuliyArt
- **Licence:** Creative Market Webfont License
- **Order:** 148142438
- **Purchased:** 19 August 2026
- **Pageview cap: 10,000 pageviews per month.**

The file here is a latin subset of the purchased original (100 KB OTF → 23 KB WOFF2).

### The cap is the term that can lapse without a signal

Nothing in this repository, in Vercel, or in the font file itself measures pageviews
or fails when the cap is passed. The licence stops covering the site quietly, and the
site keeps serving the font exactly as before. Traffic is the only place this shows.

Exceeding 10,000 pageviews per month requires upgrading the licence tier with
Creative Market before the traffic arrives, not after.

Used as `--z-font-display` (`src/styles/tokens.css`), applied to `h1, h2, h3, h4,
.z-display` (`src/styles/base.css`) — every heading and the wordmark. It is live web
text, not flattened into images, so it is fetched on every uncached page load.

## outfit-latin-var.woff2

- **Font:** Outfit (variable, weights 100–900)
- **Licence:** SIL Open Font License 1.1
- **Cap:** none

Used as the body face. Previously loaded from the Google Fonts CDN on the investor
site; self-hosted here so no third-party request is made before LCP.

## Fallback faces

`Outfit Fallback` and `Lazydog Fallback` in `src/styles/fonts.css` are metric
overrides over locally installed system fonts (`Arial`, `Arial Black`, `Impact`,
others). They download nothing and carry no licence obligation.
