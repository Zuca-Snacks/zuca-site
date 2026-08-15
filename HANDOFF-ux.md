# HANDOFF — UI/UX agent (`ux/mobile-redesign`)

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
   licence does not permit serving the file from your site, which is what both
   the investor site and this branch now do. Worth confirming regardless of the
   bold question — this is a live compliance item, not a nice-to-have.
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
  `Select`, `Field`, `Chip` + `ChipGroup` (the max-3 multi-select for
  `motivation`), `Card`, `Badge`, `Accordion`. Props are documented at the top of
  each file. Import from `src/components/ui/index.js`.
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
