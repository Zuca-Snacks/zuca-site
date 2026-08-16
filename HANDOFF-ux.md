# HANDOFF — UI/UX agent

> **Round 3 (`ux/visual-round-3`, off main `02e5649`) is at the top.**
> Rounds 1–2 (`ux/mobile-redesign`, now merged) follow below and are still
> current except where round 3 supersedes them.

---

# ROUND 3 — "make it visual"

## R3.1 🔴 Photography audit — three blockers, one of them a claim problem

I went through `~/Desktop/Zuca Photos` before speccing anything. Findings:

**`Website Development/` (21 PNGs) is not photography.** They are screenshots of
*earlier website mockups* — CSS gradient spheres, and text reading `$28`,
`PRE-ORDER NOW` and "physician-formulated". Nothing there is usable, and nothing
should be mined from it.

**The ingredients shot (`IMG_2053`) cannot ship in any crop.** Two independent
problems: it shows Kirkland/Costco retail packaging — third-party trademarks on
a commercial page — and it visibly shows **rolled oats**.

> ⚠️ **The allergen blocker is not only a copy problem.** `copy.js` has a
> blocking TODO because only tree nuts are confirmed; gluten/oats, dairy in the
> Chocolate Raspberry, and shared-facility cross-contact are not. **A photograph
> showing an unconfirmed allergen asserts it in pixels exactly as copy would in
> words.** Ingredient photography is therefore gated on the *same* confirmation
> as the allergen panel. This was not obvious to anyone, including me, until the
> photo turned up with oats in it.

**Every process photo is a domestic-kitchen snapshot** — disposable foil catering
trays on a coffee table or a patterned rug. A tight crop fixes one photo in
isolation (that is how the shipped maple pecan crop works). It does **not** fix a
five-up strip: a shared foil-tray background across the whole row reads "made in
someone's kitchen", contradicting the 21 CFR 117 line in our own FAQ.

**Usable, and now shipping:** `IMG_2059` (milled apple pulp) and `IMG_2057`
(freeze-dried raspberry). Both checked against the allergen TODO — apple and
raspberry only, no oats, dairy or nuts in frame. Cropped tight enough that the
tray is out of frame; they are in the repo as `public/process-*.jpg`.

## R3.2 📸 Shot list — reshoot spec

Send **uncropped originals at maximum resolution**. `scripts/gen-images.mjs` does
the cropping and emits AVIF/WebP/JPEG at every width; pre-cropping throws away
information that cannot be recovered.

| # | Shot | Aspect | Min export | Note |
|---|---|---|---|---|
| 1 | **Both flavours together** | 3:2 | 3000px | Does not exist. Currently faked by placing two 1:1 crops side by side. |
| 2 | Chocolate raspberry alone | 1:1 | 2000px | Reshoot — current has a tray edge top-right |
| 3 | Maple pecan alone | 1:1 | 2000px | Reshoot — current is in a foil catering pan |
| 4–8 | Process ×5 | **1:1** | 1600px ea. | collect pulp · dehydrate · mill · add flavor · roll |
| 9 | Apple pulp macro | 3:2 | 2400px | `IMG_2059` works; cleaner surface would be better |
| 10 | Founder portraits ×2 | 1:1 | 2000px | Still outstanding since round 1 |

**Rules that apply to every frame** — each one falls out of a real defect found
above, not a preference:

1. **No unconfirmed allergen visible.** Tree nuts only. No oats, no grain, no
   dairy. Same gate as the allergen copy.
2. **No third-party trademarks or retail packaging.**
3. **No domestic-kitchen context** — no foil catering trays, coffee tables or
   patterned rugs. The picture must not contradict the manufacturing sentence.
4. **Square, or generous headroom.** Every existing frame is 1536×2048 3:4, and
   a square crop costs 25% vertically off frames already shot tight.
5. **One consistent surface and light across the five process shots.** Five
   frames sharing a surface read as a process; five sharing a rug read as a
   weekend.

## R3.3 The live count badge — one mechanism, and why

**Requirement (Emil):** an absent count must not leave a hole, and an arriving
count must not reflow the hero.

Those look contradictory — reserving space prevents the reflow but *creates* the
hole. They are only contradictory for an in-flow element. The badge is therefore
**absolutely positioned inside `.z-hero__media`**, and that single mechanism
satisfies both: it is out of flow, so when the count is `null` the element is not
rendered and there is no reserved gap; and when it arrives it paints on top of
the photography, displacing nothing.

An earlier draft of this description carried *two* mechanisms (`display:none`
**and** a fixed-height row). That was redundant — caught by the merge session.
Only the absolute positioning survives.

**Measured, empty vs populated, CTA bottom:**

| Width | Count absent | Count present | Delta |
|---|---|---|---|
| 360px | 744 | 744 | **0** |
| 390px | 740 | 740 | **0** |
| 430px | 719 | 719 | **0** |

The count is no longer repeated in the capture microcopy — it was being stated
twice inside one viewport. It still appears in the proof strip, the waitlist lede
and the sticky bar, all unchanged.

## R3.4 Deviations from the deck, and why

- **One shared stat row, not per-flavour chips.** The deck shows chips under each
  product. The three numbers are identical for both flavours — `copy.js` says
  "Two flavors. Same 10 grams" — and printing them twice doubled the row height
  to state the same three facts twice, putting the CTA 1px below the fold at
  360px. Stated once, it reads as a spec rather than decoration.
- **Headline drops one type step on phones** (`--z-step-2`, full size from 48em).
  The product block now carries the visual weight, and at `--z-step-3` growth's
  headline ran to five lines of display caps restating "10g of fiber" and "150
  calories", both already shown in the stamp and the chips directly above it.
  → **Growth: the hero headline now duplicates the stat chips.** A shorter
  headline would let the type step go back up. Emil is briefing you on
  compression separately; this is the specific line that would benefit.
- **`$25/ton` is absent**, as required. It was already cut on merge.
- **No price figures**, no pre-order language, no new allergen assertions.

## R3.5 "More colours" without spending contrast

Seven AA pairings are still open (amber and green as text). **None were spent.**
All added colour is photographic: the crimson raspberry powder and the tan milled
pulp are more saturated than anything in the token palette, and a photograph
carries no contrast obligation. Amber appears only as a numeral plate on the dark
green band (6.86:1) and as a badge fill under dark ink. No amber or green text on
cream anywhere.

## R3.6 ⚠️ Performance — the budget was already spent before this round

Emil's stated budget (Lighthouse 99 / LCP 2.0s / 66KB JS) was **my round-2
branch's numbers, measured before growth and security merged**. I measured main
itself to separate the merge's cost from this round's:

| | main `02e5649` (before) | `ux/visual-round-3` (after) | Delta |
|---|---|---|---|
| Performance | 98 | **98** | — |
| Accessibility | 100 | **100** | — |
| Best practices | 100 | **100** | — |
| SEO | 100 | **100** | — |
| LCP | 2.3 s | **2.2 s** | **−0.1 s** |
| CLS | 0 | **0** | — |
| TBT | 80 ms | **10 ms** | **−70 ms** |
| JS transferred | 72.3 KB | **72.6 KB** | +0.3 KB |
| Images | 44.7 KB | 75.6 KB | +30.9 KB |

**"More visual" did not make it slower** — LCP and TBT both improved. The
JS/LCP budget was breached by the three-way merge, not by this round.

**A bug this round caught and fixed:** `index.html` still preloaded the old
single-photo hero (`hero-bites-*`) after the hero became a pair. That downloaded
an image nobody rendered *and* left the real LCP undiscoverable — worth 0.2s and
45KB. The `hero-bites` jobs and derivatives are deleted; nothing referenced them.

**Why LCP is still above 2.0s, and the real fix.** The LCP element is now **text**
(the headline), not an image, so it cannot paint until React mounts — the same
constraint main has. Preloading cannot help a text node. The structural fix is
pre-rendering the landing route (SSG), worth roughly half a second. That changes
the build setup, so it needs Emil's sign-off rather than being slipped in.

---

# ROUNDS 1–2 — `ux/mobile-redesign` (merged)

Everything below is from the UI/UX branch. I own `src/styles/**`,
`src/components/ui/**`, the layout/section components, `public/images/**` and the
font files. Requests for anything else are listed here rather than edited.

---

## 1. Dependencies added

All four are **devDependencies** — none ship to the browser.

| Package | Why |
|---|---|
| `sharp` | Build-time only. Generates the AVIF/WebP/JPEG derivatives in `scripts/gen-images.mjs`. Nothing imports it at runtime. |
| `playwright` | Screenshot + measurement harness (fold checks, overflow, tap targets). Not imported by app code. |
| `lighthouse` | Performance scoring against the production build. |
| `fonttools` (pip, not npm) | Used once to subset `Lazydog.otf` 100KB → 23KB woff2. Not a project dependency; noted for reproducibility. |

---

## 1b. Measured results

Lighthouse, **mobile** form factor, simulated throttling, against the production
build (`npm run build` + `vite preview`), not the dev server:

| Category | Score |
|---|---|
| Performance | **99** |
| Accessibility | **100** |
| Best practices | **100** |
| SEO | **92** |

| Metric | Result | Budget |
|---|---|---|
| LCP | **2.0 s** (2.0–2.2 s across runs) | < 2.0 s — **at/marginally over** |
| CLS | **0** | < 0.05 ✅ |
| TBT | **0 ms** | — |
| FCP | 1.3 s | — |
| Speed Index | 1.3 s | — |
| JS, landing route | **65.3 KB** gzipped | < 120 KB ✅ |
| CSS | 5.0 KB gzipped | — |
| Fonts | 54.7 KB (both, self-hosted) | — |
| Hero image | **44.4 KB** AVIF on a phone | < 150 KB ✅ |

**On LCP.** It started at 2.4 s. Two fixes brought it to ~2.0 s: a dedicated 16:9
phone crop (the phone was downloading the 1024px-tall portrait and throwing away
two thirds of it — 83 KB of pure waste), and a `<link rel=preload as=image>` in
`index.html`, because the hero `<img>` is rendered by React and the browser's
preload scanner cannot see it in the initial document. That cut LCP element
render delay from **3049 ms to 311 ms**.

It sits right on the 2.0 s line rather than comfortably under. The remaining cost
is React mounting before the image can enter the DOM. **I tried** hard-coding a
static copy of the hero `<picture>` into `index.html` so it paints before the JS
loads — it gained ~0.1 s, which is inside run-to-run noise, in exchange for
duplicated markup that would silently drift the moment anyone edits `Hero.jsx`.
I reverted it. If you want to go under 2.0 s properly, the real levers are
pre-rendering/SSG for the landing route, or dropping React for this one page.
Say the word and I'll cost it out.

**On SEO.** The single deduction was `robots.txt is not valid` — there wasn't
one, so the server returned `index.html` for `/robots.txt` and the parser choked.
Emil handed me ownership of these, so `public/robots.txt` and
`public/sitemap.xml` now exist and the deduction is closed (**SEO 92 → 100**).

⚠️ The sitemap lists **only `/`**. The footer links to `/privacy` and `/terms`,
which don't exist yet — they're the security agent's. **Add them to
`public/sitemap.xml` when those routes ship**; listing URLs that 404 wastes crawl
budget and counts as a quality signal against the site. Both files hardcode
`https://zucasnacks.com` — update if the production domain differs.

**Verified with a browser at 360 / 390 / 430 / 768 / 1280 px:**
- No horizontal scroll at any width; no element wider than the viewport.
- Hero photo + promise + email field + CTA all above the 844 px fold at every width.
- Zero images missing `alt`; zero inputs under 16px; exactly one `<h1>`;
  heading order clean (H1 → H2 → H3, no skips); `header`/`main`/`nav`/`footer`
  landmarks present; skip link is the first tab stop.
- `prefers-reduced-motion`: all content visible, all animation `none`.
- Sticky CTA: hidden at top of page, visible mid-page, **hidden when the
  waitlist section is on screen**, and `tabindex="-1"` while off-screen so
  keyboard users never land on an invisible button.
- Remaining sub-44px tap targets are the three inline footer text links
  (email / Privacy / Terms), which WCAG 2.2 SC 2.5.8 explicitly exempts as
  inline targets within a sentence.

---

## 2. ⚠️ Contrast failures in the real brand palette — **need your approval**

You asked me to use the real brand from <https://zucainvestor.netlify.app/> and
flag failures rather than silently fixing them. **I did not change any brand
value.** Ten pairings from the real palette fail WCAG AA:

| # | Pairing | Real values | Ratio | Needs | Suggested accessible variant |
|---|---|---|---|---|---|
| 1 | Muted text on page background | `--gray #888888` on `--cream #FDE0B4` | **2.78:1** | 4.5:1 | `#666666` → 4.51:1 |
| 2 | Muted text on card | `#888888` on `--white #FFFDF8` | **3.49:1** | 4.5:1 | `#666666` → 5.65:1 |
| 3 | Muted text on alt surface | `#888888` on `--cream-2 #FFF3E0` | **3.23:1** | 4.5:1 | `#666666` → 5.24:1 |
| 4 | Brand red text on background | `--red #CC1850` on `#FDE0B4` | **4.33:1** | 4.5:1 | use `--red-dark #A3112D` → 6.17:1 |
| 5 | Cream label on red button | `#FDE0B4` on `#CC1850` | **4.33:1** | 4.5:1 | use `--white #FFFDF8` → 5.42:1 |
| 6 | Amber text on background | `--amber #FDB026` on `#FDE0B4` | **1.45:1** | 4.5:1 | `#845C14` → 4.68:1 |
| 7 | Amber text on card | `#FDB026` on `#FFFDF8` | **1.81:1** | 4.5:1 | `#845C14` → 5.87:1 |
| 8 | Amber as *large* display text | `#FDB026` on `#FDE0B4` | **1.45:1** | 3:1 | `#845C14` |
| 9 | Green-accent text on background | `--green-accent #089B35` on `#FDE0B4` | **2.87:1** | 4.5:1 | `#067428` → 4.66:1 |
| 10 | Green-accent text on card | `#089B35` on `#FFFDF8` | **3.59:1** | 4.5:1 | `#067428` → 4.87:1 |

### ✅ RESOLVED — muted text (#1, #2, #3)

**Emil approved `#666666`.** The two tokens are collapsed: `--z-ink-muted` now
holds `#666666` and `--z-ink-muted-aa` no longer exists. Rationale, in his words:
a barely-perceptible darkening of gray is worth more than matching `#888888`
exactly, and muted text is everywhere. Contrast is now 4.51:1 on the cream
background, 5.65:1 on cards, 5.24:1 on the alt surface — all pass.

**Rows 4–10 are still open** and use real brand values as shipped; see below.

**What I shipped in the meantime.** Rather than alter your brand or ship failing
text, the layout only uses these colors where they *do* pass:

- **Amber** appears only as a **fill** (badges, the process step numbers on the
  dark green band). Amber on dark green is 6.86:1 and brown-on-amber is 5.32:1 —
  both pass. Amber is never used as text on cream.
- **Green-accent** is currently unused as text.
- **Brand red** is used for CTA fills (white on red = 5.42:1) and for the
  wordmark. Red *text* on cream uses `--red-dark` instead, which is a real brand
  color, not an invented one.
- **Gray `#888`** was the one I could not route around. **Resolved above** —
  `--z-ink-muted` is now `#666666`.

Run the audit yourself any time:
`node scratchpad/contrast-brand.mjs` (script path in my session notes; happy to
commit it to the repo if useful).

---

## 3. What I took from the brand site vs. what I invented

**Taken verbatim** (read out of the page's `:root`, not eyedropped):

| Token | Value | Source |
|---|---|---|
| `--z-bg` | `#FDE0B4` | `--cream` (the site's `body` background) |
| `--z-surface` | `#FFFDF8` | `--white` |
| `--z-surface-alt` | `#FFF3E0` | `--cream-2` |
| `--z-ink` | `#524128` | `--brown` (the site's `body` color) |
| `--z-ink-muted` | `--gray #888888` → shipped as `#666666` | `--gray`, darkened to pass AA (approved) |
| `--z-brand` | `#CC1850` | `--red` |
| `--z-brand-dark` | `#A3112D` | `--red-dark` |
| `--z-accent` | `#CC1850` | `--red` — the site's CTA fill, so accent = brand deliberately |
| `--z-accent-ink` | `#FFFDF8` | `--white` |
| `--z-warm` | `#FDB026` | `--amber` |
| `--z-success` | `#089B35` | `--green-accent` |
| `--z-focus` | `#CC1850` | `--red` |
| `--z-ink-surface` | `#1A3A1A` | `--green` (the dark band) |
| `--z-radius-md` | `16px` | `--r` |
| `--z-max` | `1140px` | `--max` |
| `--z-step-1…4` | the `clamp()` ramps | the site's own `clamp(18px,2.5vw,26px)`, `clamp(22px,3vw,34px)`, `clamp(32px,5vw,58px)`, `clamp(44px,5vw,72px)` |
| `--z-font-display` | Lazy Dog | `--font-display: 'Lazy Dog'`, served there as `/Lazydog.otf` |
| `--z-font-body` | Outfit | `--font-body: 'Outfit'`, loaded there from the Google CDN |

**Invented** (no equivalent existed on the brand site):

| Token | Value | Reasoning |
|---|---|---|
| `--z-ink-muted` | `#666666` | **Approved by Emil.** The brand's `--gray #888888` is 2.78:1 on cream and fails AA at body size. Same hue, darkened until it passes. See §2. |
| `--z-border` | `#E9C88C` | Decorative hairline. No border color existed. |
| `--z-border-strong` | `#8A7250` | Input/control edges need 3:1 per WCAG 1.4.11; the decorative hairline is 1.26:1. 3.58:1 on cream. |
| `--z-danger` | `#B3261E` | No error color on the site. Kept visibly distinct from the pink-red brand so an error never reads as a CTA. 5.14:1 on cream. |
| `--z-on-ink-muted` | `#E9C88C` | Dimmed cream for the dark green band. 7.88:1. |
| `--z-radius-sm` / `--z-radius-full` | `8px` / `999px` | Only `--r: 16px` existed. |
| `--z-shadow-sm/md` | brown-tinted rgba | No shadows on the site. Tinted with the brand brown rather than neutral grey so they sit correctly on cream. |
| `--z-space-1…8`, `--z-section-y`, `--z-gutter` | 4px-based scale | The site used ad-hoc pixel padding. |
| `--z-step--1`, `--z-step-0` | 13→14px, 16→17px | The site's small sizes were ad-hoc (11/12/13/14/15px). `--z-step-0` is raised to a **16px minimum** — the site used 15px, but the brief requires ≥16px body and iOS zooms any focused input below 16px. |
| `--z-ease`, `--z-dur` | `cubic-bezier(.16,1,.3,1)`, 240ms | No motion tokens existed. |

**Two deliberate deviations from `AGENTS_BRIEF.md`,** because your instruction to
match the brand site supersedes it:

1. The brief specified **Fraunces + Inter**. The brand site uses **Lazy Dog +
   Outfit**, so that is what shipped. I downloaded Fraunces/Inter first and then
   deleted them. Token *names* (`--z-font-display`, `--z-font-body`) are unchanged,
   so no other agent is affected.
2. The brief's starting palette was green-led (`--z-brand:#1F6B4A`). The real
   brand has no green except the dark band. Names unchanged, values replaced.

---

## 4. Fonts

Both self-hosted in `public/fonts/` — **no Google CDN request**, which the brand
site currently makes on every visit.

| File | Size | Notes |
|---|---|---|
| `lazydog-latin.woff2` | **23 KB** | Subset from the 100 KB `Lazydog.otf` on your site (latin + punctuation only). |
| `outfit-latin-var.woff2` | **31 KB** | Variable, latin subset, weights 100–900 in one file. |

Both are `<link rel=preload>`ed in `index.html` because both render above the fold.

**Zero-CLS fallbacks.** I measured both faces against system fonts in Chromium
and generated metric overrides so nothing reflows when the webfont swaps in:

| Fallback face | size-adjust | ascent | descent | Width delta before → after |
|---|---|---|---|---|
| Outfit → Arial | 97.61% | 102.45% | 26.64% | −1.62% → **0.00%** |
| Lazydog → Arial Black | 96.76% | 87.85% | 20.67% | −2.27% → **0.00%** |

### ⚠️ Lazy Dog ships one weight — what a real bold cut would take

Your investor site sets `font-weight:800` on Lazy Dog. The font contains only a
Regular, so the browser **fakes** the bold by algorithmically smearing each glyph
outward. It looks cheap at display sizes — exactly where the wordmark and every
headline live. I declared the face `400` and let size carry emphasis instead.

**Who made it**, read out of the font file's own name table:

| Field | Value |
|---|---|
| Family / style | `Lazydog` / `Regular` (single weight) |
| Designer | **Juliya Kochkanyan** |
| Vendor / license URL | <https://creativemarket.com/Juliya89> |
| Version | 1.005, built with Fontself Maker 3.5.1 |

**What that tells us.** It is an independent Creative Market display font, not a
foundry family with a weight range. Fonts in this category are typically sold as
a one-off desktop licence in the ~$15–30 range, usually with a separate webfont
licence — but **I have not verified current pricing or what licence Zuca already
holds, and you should not budget off my estimate.** Two things to check before
anything else:

1. **Does Zuca's existing licence cover web embedding at all?** A desktop-only
   licence does not permit serving the file from your site. Worth confirming
   regardless of the bold question — this is a live compliance item, not a
   nice-to-have.

   > ⚠️ **This is NOT a this-branch problem — it applies to two properties, and
   > fixing one does not fix the other.**
   >
   > | Property | Exposure |
   > |---|---|
   > | **zucainvestor.netlify.app** | Serves the **unsubsetted `Lazydog.otf` (100KB)** from its web root today. This is the pre-existing exposure and it is live right now. |
   > | **This branch (zuca.com)** | Serves a 23KB latin **woff2 subset** I generated from that same OTF. Subsetting and format-converting a font is itself a modification that many licences restrict separately from embedding. |
   >
   > Do not close this item when only the marketing site is sorted. The investor
   > site is the one that is already public. If the licence turns out not to
   > cover web use, **both** need remediating, and the investor site first.
2. **Is there a bold weight for sale?** The name table shows a single-weight
   family, so most likely not. Ask Juliya Kochkanyan directly via the Creative
   Market link.

**Your realistic options, cheapest first:**

- **Do nothing** (what's shipped). Regular-only, emphasis via size. Costs $0 and
  looks correct. My recommendation until the brand needs more range.
- **Commission a bold cut** from the original designer. Preserves the brand
  exactly. Custom weight work from an independent designer is normally a
  low-hundreds-to-low-thousands commission depending on character set — get a
  quote, don't assume.
- **Switch display faces** to a variable font with a real weight axis. Free
  options with genuine display bolds exist, but it changes the brand's voice, so
  it is a brand decision rather than a technical one.

⚠️ Do **not** "solve" this by setting `font-weight: 700+` on Lazy Dog. That is
the faux-bold that motivated the change. If a heavier look is needed before a
real cut exists, increase size or use color/spacing for hierarchy.

---

## 5. 📸 Photography I need from you

This is the biggest remaining gap. There are exactly **two** real photos in the
repo and I used both. Everything else is typography and color doing the work of
a picture. I did not use a stock photo of another product and did not generate
any fake product imagery.

**Existing assets, and their problems:**
- `chocolate-raspberry.jpg` — genuinely appetizing, now the hero. Shot on a
  reflective tray; I cropped the rim out. It is the strongest asset you have.
- `maple-pecan.jpg` — the bites look great but it was shot **in a foil catering
  tray on a wooden bench**, which reads "catering", not "premium D2C". I cropped
  the tray out entirely; the crop is doing a lot of work.

**Shot list, in priority order:**

1. **Hero — overhead, 6–8 bites on cream linen, natural side light, 4:5 crop.**
   Shallow depth of field, one bite broken open to show the interior texture.
   This is the single highest-leverage asset on the site. 3000px on the long
   edge, RAW or max-quality JPEG.
2. **Founders — two portraits, Emil and Kelley, 1:1 crop, natural light, waist
   up, warm neutral background.** Real faces are the highest-trust element the
   page can carry and there are currently none — I am rendering initials in a
   circle as an honest placeholder. Chef whites / clinical setting both work;
   consistent lighting between the two matters more than location.
3. **Process — apple pulp, close macro, 3:2.** The raw pulp in a hand or a
   bowl. This is the whole upcycling story and right now it is a green text
   block. One shot of pulp and one of finished bites side by side would carry it.
4. **Product-in-hand — someone holding a bite, 4:5, natural light.** Gives scale;
   nothing on the page currently shows how big a bite actually is.
5. **Packaging — once it exists.** Front-of-pack on cream, 1:1. There is no logo
   file in the repo either; the wordmark is currently set in Lazy Dog as live
   text. **A real logo asset (SVG) would be useful.**

Drop them in `public/` and run `node scripts/gen-images.mjs` — it emits AVIF +
WebP + JPEG at every needed width. Add a job entry per new image.

---

## 6. Requests for other agents

### For the conversion agent (`growth/waitlist-conversion`)

- **Your mount point is ready.** `src/components/sections/WaitlistSlot.jsx`
  renders `<section id="waitlist" class="z-waitlist-slot">`. Pass your form as
  children: `<WaitlistSlot><MyForm /></WaitlistSlot>` in `src/App.jsx`. A styled
  placeholder renders when there are no children, so the page is never broken
  mid-merge.
- **Primitives are fully styled** — rest, hover, `:focus-visible`, `:disabled`,
  error and loading. You should only need to write logic. `Button`, `Input`,
  `Select`, `Field`, `Checkbox`, `Chip` + `ChipGroup` (the max-3 multi-select for
  `motivation`), `Card`, `Badge`, `Accordion`. Props are documented at the top of
  each file. Import from `src/components/ui/index.js`.

- **`Checkbox` + the consent block** were added for the GDPR Art 7(1) amendment.
  There was no checkbox primitive, so you could not have rendered a consent
  control without writing your own styles — that is the one piece of the
  amendment that landed in UX's lane. What it gives you:
  - A 24px box on a **47px tap row**; the `<label>` toggles it.
  - A separate `legal` slot beneath the label. **Put the privacy link there, not
    in `label`** — a link inside a `<label>` toggles the checkbox when clicked.
    Verified: clicking the label toggles, clicking the privacy link does not.
  - `consentVersion` prop → rendered as `data-consent-version` on the wrapper,
    so `consent_text_version` sits adjacent to the wording it describes and is
    inspectable on the live page. **Bump it in the same commit as any wording
    change** — a stale-but-plausible consent record is worse than none.
  - The shell renders it **unticked**. Never pre-tick a consent box; pre-ticked
    is not freely given consent under GDPR.
  - `consent_timestamp` and `country` are server-set — send neither from the
    client, and **never add a country field**; it is derived from request IP.
- **Hero email prefill.** The hero has its own email field (required: reachable
  without scrolling). It does **not** POST — it dispatches
  `window` event `zuca:hero-email` with `{ detail: { email } }` and scrolls to
  `#waitlist`. Listen for it and prefill step one so the user never types their
  address twice.
- **All copy on the page is placeholder** and yours to replace. Written to be
  guardrail-safe: nutrient content and taste only.

- 🔴 **ACTION REQUIRED AT MERGE — one duplicated copy string.** The hero brand
  entrance renders `introLines[0]` from your `src/content/copy.js`:
  *"A Michelin-trained chef and a Stanford physician"* (trailing comma stripped,
  since it is used standalone rather than as the first of three).

  It is currently a `const INTRO_LINE` at the top of
  `src/components/sections/Hero.jsx`. It is duplicated **only** because
  `src/content/copy.js` does not exist on this branch, and creating it here
  would collide with your own copy of the file — merge order is UX → Conversion
  → Security, so this branch lands first. **On merge, delete the constant and
  restore the single source of truth:**

  ```jsx
  import { introLines } from '../../content/copy.js';
  // ...
  <p className="z-hero__tagline">{introLines[0].replace(/,$/, '')}</p>
  ```

  Note for whoever edits `introLines`: line 1 is now rendered standalone in the
  hero as well as being the first of the three-line sequence, so it needs to
  read correctly on its own. Lines 2 and 3 are fragments and are not used here.

- **The hero badges** ("Pre-order open", "10g fiber") are **hidden below 768px**.
  The tagline took that slot, and the badges repeat what the lede states one line
  later — not worth 40px of an 844px fold, which was the difference between the
  CTA being above or below it. They render at tablet width and up. If you want
  the pre-order urgency on phones, it needs to displace something else; tell me
  what and I'll rebalance.
- **`src/zuca-gate-v4.jsx` is now dead code** but I left it in place — it still
  contains the original form logic and the Google Sheets POST, which is yours to
  migrate or delete. Nothing imports it.

### For the security agent (`sec/hardening`)

- **A live Google Apps Script webhook URL is hardcoded** at
  `src/zuca-gate-v4.jsx:5`. It is no longer called (the file is unreferenced) but
  it is still in the repo and in git history.
- The footer links to `/privacy` and `/terms`, which don't exist yet. They're
  plain paths so they'll work the moment your pages land.

- 🔴 **ACTION REQUIRED WHEN YOUR BRANCH MERGES — add your routes to the sitemap.**
  `public/sitemap.xml` currently lists only `/`. Deliberate: listing URLs that
  404 wastes crawl budget and is read as a quality signal against the site. Once
  `/privacy` and `/terms` exist, add them:

  ```xml
  <url><loc>https://zucasnacks.com/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
  <url><loc>https://zucasnacks.com/terms</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
  ```

  Also update `<lastmod>` on `/` and confirm the domain — both `robots.txt` and
  `sitemap.xml` hardcode `https://zucasnacks.com`.
- `index.html` now has one small inline `<script>` (adds a `z-js` class before
  paint). **If you add a CSP, it needs a hash or nonce** — or tell me and I'll
  move it to an external file.

### For Emil — health-claim guardrail violations I found in the existing site

I fixed the ones inside files I own and flagged the rest. All of these are on
the brief's **forbidden** list:

| Where | Text | Status |
|---|---|---|
| `index.html` `<title>`, description, OG + Twitter tags | "**Physician-recommended** fiber snacks" | **Fixed** — replaced with a nutrient-content title. Conversion agent owns final wording. |
| Hero headline | "Your gut is **sick**. Fix it." | Removed in the rebuild. |
| Hero body | "A chronic **disease** epidemic" | Removed. |
| Intro tagline | "the snack brand that **clinicians recommend**" | Removed. |
| Product + footer | "**Clinician-formulated**" | Removed. |
| Founders list | "**Reversed autoimmune disease** through plant-based diet" | **CUT, not reworded — Emil's explicit decision.** See the Cooley item below. |
| Pre-order form | "Why do you want Zuca?" → "**Weight management**" option | Gone with the old form. The brief's `motivation` enum has no weight option — conversion agent should not add one. |

Nothing I wrote names a disease, implies treatment or prevention, or claims
endorsement. The strongest health line on the page is "Fiber supports digestive
health", which is an allowed structure/function claim.

### 🔴 "Pre-order" language removed sitewide — AGENTS_BRIEF.md is now wrong

**Emil, 15 Aug:** *"Nobody has paid us — these are waitlist signups, not
pre-orders, and a badge claiming otherwise is a claim we can't support."*

That principle is broader than the badge it was aimed at. The page said
"pre-order" in **five** places, each implying a transaction that has not
happened and that the site cannot even perform — there is no payment step
anywhere. All five are changed:

| Where | Was | Now |
|---|---|---|
| Hero badge | "Pre-order open" | **deleted at every breakpoint** |
| Hero microcopy | "130+ people already pre-ordered." | "130+ people are already on the list." |
| Waitlist section eyebrow | "Pre-order" | "Waitlist" |
| FAQ, ship date | "We're in pre-order now and manufacturing with…" | "We're manufacturing with… now" |
| Proof strip | "130+ **pre-orders** placed before launch" | "130+ **signed up** before we launched" |

⚠️ **The last row conflicts with the shared brief.** `AGENTS_BRIEF.md` lists
**"Traction: 130+ pre-orders"** under *"verified facts — do not invent others"*.
Emil's statement supersedes it, but the brief is the document the conversion and
security agents are working from, and it will keep telling them "pre-orders" is
verified.

**→ Emil: please correct the verified-facts list in `AGENTS_BRIEF.md` at source**
(e.g. "130+ waitlist signups"), otherwise the stronger wording gets reintroduced
by another agent in good faith. I have not edited the brief — it is the shared
contract and not mine to change.

**→ Conversion agent:** the `intent` enum in the frozen waitlist contract still
contains `preorder_now`. That's an internal enum value describing purchase
*intent*, not a user-facing claim, so it does not need to change — but do not
surface the phrase "pre-order" in the UI label for it.

---

### ✅ Consent block: multi-line verification + the fold maths

Tested against growth's **real** strings from
`origin/growth/waitlist-conversion:src/content/copy.js`, not invented ones.

**1. Checkbox alignment with a wrapping label — passes.**
The box is centred on the label's **first line**, not on the block, so it does
not drift as the text wraps. Measured drift at 360 / 390 / 430 across the US
string, the EEA string, the projected longer EEA string and the Art 9 motivation
string — **0px in every case**, up to 9 wrapped lines.

The offset is derived from tokens, not hardcoded:
`margin-top: calc(var(--z-space-3) + (1.4em - 24px) / 2)`, with `font-size`
pinned on the input so `1.4em` resolves against the label's size. It was a magic
`10px` before this check; it would have drifted if the type scale ever moved.

**2. Cost of the new "plus a short series when we launch" clause:**

| Width | EEA current | EEA + new clause | Delta | Lines |
|---|---|---|---|---|
| 360px | 271px | 293px | **+22px** | 8 → 9 |
| 390px | 229px | 252px | **+23px** | 7 → 8 |
| 430px | 230px | 230px | **+0px** | 7 → 7 (absorbed by an existing line) |

**3. Does it break the fold? No — but the margin is now thin.**
Growth measured the EEA variant with the CTA at **763px of 844** → 81px of
headroom. Adding 23px puts it at **~786px, clearing the fold with ~58px spare**.
360px is the tightest at +22px.

⚠️ Caveat on that number: it assumes growth's step-2 container is the same width
as this shell's (`max-width: 34rem` inside `--z-gutter`). If their form sits in a
narrower container the string wraps to more lines and costs more. **Growth: re-run
the measurement on your own layout once the string lands — my delta is measured
in this shell.**

**4. 🟢 DECISION (Emil, 15 Aug): nothing is cut.** The fold holds with ~58px
spare, so the lede, the eyebrow and the email hint all **stay**. The table below
is a **contingency, not a recommendation** — do not apply any of it on sight.
It exists so that if a future consent string grows, the next person already knows
what the cheapest 135px are and does not reach for the consent text first.

**Never cut the consent text.** It is a legal commitment and a promise about
sending cadence; trimming it for layout would mint a weaker consent record, which
is exactly the failure mode the amendment exists to prevent. If a future string
genuinely will not fit, work down this list and come back for more rather than
touching the wording.

| # | Cut | Saves @390 | Why it is safe to lose |
|---|---|---|---|
| 1 | The section lede, *"130+ people are already on the list. It takes one field."* | **75px** | Pure duplication — the proof strip already states 130+, and the hero microcopy repeats it directly above the fold. |
| 2 | The eyebrow, *"Waitlist"* | **32px** | The `<h2>` directly beneath it already says "Get first access when it ships." The eyebrow is decoration. |
| 3 | The email field's hint, *"Only your email is required. No payment today."* | **20px** | The consent text now states the sending behaviour, and the CTA label says "Join the waitlist", not "Buy". |
| 4 | Tighten `.z-waitlist-slot__inner` gap from `--z-space-5` to `--z-space-4` | **8px** | Purely visual rhythm; the section keeps its outer padding. |
| | **Total available without touching consent** | **~135px** | Nearly 6× the 23px the new clause costs. |

**✅ Resolved separately:** the Art 9 motivation consent was a second block
costing **184px at 390px** (429px stacked with the EEA marketing consent).
Growth is putting it behind a progressive disclosure — shown only once the user
actually selects a motivation — which returns that 184px to the default view.
That is a consent-flow decision and was growth's to make; no layout change was
needed from UX, and `.z-waitlist-mount` already tolerates the block appearing and
disappearing (see the variable-field-count section below).

### ✅ Step 2 tolerates a variable field count

`.z-waitlist-mount` is a bare `display: grid` + `gap` — implicit rows, and there
is **no `grid-template-rows`, no `grid-auto-rows`, no `:nth-child` and no fixed
height** anywhere in the form layout (the only `:nth-child` in the codebase is
on the four wordmark letters, which are fixed by definition).

Verified by rendering 8 fields, removing ZIP to get 7, then reducing to 1:
uniform 16px gap every time, zero overlap. Hiding ZIP for non-US visitors needs
no layout change. A comment in `sections.css` records the constraint so it is not
regressed by a later "tidy-up".

---

### ⚠️ `zip` is US-only, but the outreach list is now international

Not my field and not my call — flagging because it surfaced directly from the
consent amendment and affects growth **and** security.

The frozen contract defines:

```jsonc
"zip": "string|null, /^[0-9]{5}$/"
```

That regex accepts **only US 5-digit ZIPs**. Emil, 15 Aug: *"Our outreach list
spans the US, Latin America, Asia, and Europe."* Under that scope the field will
reject the majority of valid postal codes it is shown — UK `SW1A 1AA`,
Netherlands `1011 AB`, Japan `100-0001`, Brazil `01310-100`, Canada `M5V 2T6`.

The failure is quiet and bad: an international user types a real postcode, gets
a validation error with no way to proceed, and the most likely outcome is that
they abandon rather than clear the field. `zip` is optional in the contract, so
the cheapest fix is to only *show* it when the server-derived `country` is US —
which is now available, since `country` is being added anyway. Alternatives:
relax to `^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$` and validate server-side per country,
or drop the field.

**No UI change made** — I don't own the field or the contract. Raising it so it
is a decision rather than a bug report after launch.

---

### 📋 FOR COOLEY LLP TO CONFIRM

**Item: removal of the autoimmune credential from the founders section.**

- **Removed text:** "Reversed autoimmune disease through plant-based diet",
  previously listed as a credential under Kelley Yuan, MD.
- **Decision:** cut entirely. Not softened, not reworded, not moved elsewhere on
  the site. Emil's call, and I agree with the reasoning: the sentence is
  unobjectionable in an investor deck, but on a consumer product page it sits
  inches from the product and beside a physician's credentials, where proximity
  converts a personal biographical fact into an **implied claim that the product
  treats or mitigates a disease**. Zuca is a food, not a drug.
- **Replaced with**, carrying the same authority and no claim: "Stanford Medicine
  physician" and "Leads Zuca's clinical network — 10+ physicians across 7
  specialties".
- **Ask of Cooley:** confirm (a) the removal is sufficient, and (b) that the
  remaining founders copy — a physician co-founder listed beside a fiber product
  — does not itself constitute an implied endorsement or disease claim. This is
  the one part of the page where a compliant sentence and a non-compliant one
  look almost identical, so it is worth an explicit sign-off rather than an
  assumption.
- **Guard in code:** `src/components/sections/Founders.jsx` carries a
  do-not-reinstate comment at the top of the file.

---

## 7. The intro gate — removed for everyone, no branching

**Decision (Emil): one behaviour, no branching.** The gate is not conditionally
skipped, not bucketed by traffic source, and not A/B tested. There is exactly one
experience for organic and paid traffic alike. The component is archived at
`src/components/IntroGate.jsx` as a reference — nothing imports it, and its
header comment explicitly says not to reintroduce a query-param/UTM/bucketing
branch to show it. The point was to delete a code path, not hide one.

**→ Growth agent:** drop any UTM-based gate-skip branching. **Keep the UTM
capture itself** — the `utm` object is still part of the frozen waitlist contract
and still needs to be collected and posted.

**The brand moment is preserved.** The ZUCA wordmark at the top of the hero
animates in letter by letter over 630ms. Note I render it in the header element
that sits directly above the hero copy rather than as a second wordmark inside
the hero body — having two ZUCA wordmarks stacked within the first viewport
looked like a mistake. It is a single wordmark, above the fold, in the hero
region. It never blocks input (the email field is interactive from frame one),
it finishes instantly on any scroll / tap / keypress, and it does not run at all
under `prefers-reduced-motion`.

---

## 8. Known gaps / what I did not do

- **No dark mode.** The brand is defined entirely as warm cream + berry red +
  amber, with no dark counterpart on the investor site. Inverting it means
  inventing a second brand and a second contrast audit — not "genuinely free",
  so per the brief I skipped it rather than half-shipping it. The page declares
  `color-scheme: light` so controls render correctly on dark-mode phones.
- **No real founder or process photography** — see §5.
- **`src/zuca-gate-v4.jsx` left in the tree** as dead code, deliberately, because
  it holds form logic the conversion agent may want. It still fails `npm run
  lint` (7 pre-existing errors). My files lint clean.
- **`--z-ink-muted` is currently double-tokened** pending your approval on §2.
