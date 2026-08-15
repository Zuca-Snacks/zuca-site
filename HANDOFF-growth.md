# HANDOFF — Conversion / Growth agent (`growth/waitlist-conversion`)

## Dependencies added

**None.** No new package was installed. `package.json` is untouched, so there is
nothing to resolve on merge.

---

## → For the UI/UX agent (`ux/mobile-redesign`)

### 1. Primitives I need from `src/components/ui/`

`src/components/ui/` did not exist on my branch, so I built the minimum unstyled
versions in **`src/components/waitlist/primitives.jsx`**, on tokens only. I
deliberately did *not* create files under `src/components/ui/`, so our branches
cannot collide. Swapping to your real primitives is an import change in four
files. The prop API I depend on:

| Primitive | Props I pass |
|---|---|
| `Button` | `type`, `variant: "primary" \| "secondary" \| "ghost"`, `disabled`, `busy`, `busyLabel`, `onClick`, `children` |
| `Input` | `id`, `label`, `type`, `inputMode`, `autoComplete`, `enterKeyHint`, `maxLength`, `placeholder`, `value`, `disabled`, `onChange`, `onFocus`, `error`, `errorId`, `ref` |
| `Field` | `error`, `errorId`, `children` — **must always render the error slot**, even when empty, or an appearing error shifts the layout |
| `ChipRadioGroup` | `legend`, `name`, `options: [{value,label}]`, `value`, `onChange`, `hint` |
| `ChipMultiGroup` | `legend`, `options`, `values`, `onChange`, `max`, `hint`, `disabled` |
| `Consent` | `id`, `checked`, `onChange`, `separate`, `describedBy`, `children` |
| `Accordion` | Not used — the FAQ is native `<details>/<summary>`. Zero JS, keyboard-complete, no shift on open. Restyle `.zc-faq` rather than replacing it, unless you need something it can't do. |

Chips must keep a **≥44px tap target in both axes** and `aria-pressed` /
`aria-checked` for their selected state — the styling hangs off those attributes.

### 2. Delete `src/components/waitlist/tokens.fallback.css` when you merge

It carries the starting token values from `AGENTS_BRIEF.md` so this branch can
run standalone. It sits inside `@layer zuca-token-fallback`, which loses to any
unlayered rule, so **your `src/styles/tokens.css` wins automatically** the moment
it exists — no specificity fight, nothing to un-wire. Delete the file and its two
`@import` lines (`waitlist.css`, `content/sections.css`) at your convenience.

**This is the only file on my branch containing a hex value.** Everything else is
`var(--z-*)`.

### 3. Token-role inversion for dark surfaces

The hero and footer sit on a dark ground while the tokens are a light palette. I
added `.zc-invert` in `src/components/content/sections.css`, which remaps
`--z-ink → --z-surface`, `--z-ink-muted → --z-surface-alt`, `--z-brand →
--z-warm` for that subtree. No new values. **Keep the waitlist form outside any
`.zc-invert` wrapper** — it is a light card and needs the tokens the right way up.

If you introduce a proper inverted-surface convention, replace `.zc-invert` with
it and I'll follow.

### 4. Sections I built that are really yours

`src/components/content/sections.jsx` + `sections.css` — `ProofStrip`,
`NumberBlock`, `Faq`. These are minimum viable structures so the rewritten copy
could ship. Absorb or restyle them freely; **all copy comes from
`src/content/copy.js`, so restyling never touches wording.**

### 5. Layout bugs I found but did not fix (yours)

- **`.nav-strip` collides at 390px.** "ZUCA" and "Waitlist open" overlap — see
  `docs/screenshots/01-hero-390-above-fold.png`, top of frame. Pre-existing; the
  text length is unchanged from "Pre-order open".
- **`html, body { cursor: none }`** hides the system cursor site-wide for the
  custom cursor. Inside a form, people need to see where they are typing, so I
  set `cursor: auto` on `.zw` and `.zc` and `cursor: pointer` on my controls.
  If you rework the cursor, keep that carve-out.
- **`.hero-left` padding is `80px 32px` at ≤900px.** That top padding is what
  pushes the form down; if you tighten it, step 1 moves further above the fold.

---

## → For the Security agent (`sec/hardening`)

### 1. `/api/waitlist` does not exist yet — I fall back

This is a static Vite SPA. There is no server and no `/api/waitlist`. My client
(`src/components/waitlist/api.js`) POSTs to `/api/waitlist` per the frozen
contract, and **falls through to the existing Google Apps Script webhook on 404 /
405 / 501 / transport failure** so no signup is lost before your branch ships.

**When `/api/waitlist` is deployed, delete `FALLBACK_URL` and the two
`postFallback()` calls in `api.js`.** Until then the webhook URL is hardcoded in
that file exactly as it was in `zuca-gate-v4.jsx` on `main` — I did not introduce
it, I moved it.

Note the fallback uses `mode: "no-cors"`, so its response is opaque and a write is
optimistically treated as accepted. That is precisely why it is a fallback.

### 2. Three things I need from the endpoint

1. **Return `position` in the 200 body.** The contract's `200 {"ok":true}` carries
   no position, but the confirmation screen shows "you're #143" — the highest-
   attention moment on the site. I currently read list size from the webhook's
   `GET`, which is a separate round trip and will break when the fallback is
   removed. `200 {"ok":true,"position":143}` is a superset of the contract and
   costs you nothing.
2. **Upsert on repeat email, don't 409 the profile.** Step 1 POSTs
   `{email, consent_marketing}` immediately. Step 2 POSTs a *second* time with
   the same email plus the full profile. If the second POST is rejected as a
   duplicate, **every step-2 answer is silently discarded.** Please upsert:
   same email + non-null profile fields = update the existing row. The UI treats
   409 on the step-2 POST as success because it cannot tell the difference.
3. **Rate limit per-IP, not per-email.** Two POSTs per signup is the normal path,
   plus retries. A limit of 2/min would break the happy path.

### 3. Bot signals I already send

- `hp_field` — honeypot, off-screen (not `display:none`). Must be empty.
- `form_render_ts` — ms epoch stamped once per form mount. `<2s` to submit = bot.
- Both are in every payload, including the fallback path.

### 4. `/privacy` must exist before the campaign sends

The consent checkbox links to `/privacy` (`step1.privacyHref` in
`src/content/copy.js`). Right now that 404s. **A cold outbound campaign with a
broken privacy link is the one thing here that is actually a legal problem.**
Point me at the real path if it isn't `/privacy` and I'll change one line.

### 5. Failed submissions are queued client-side

On total transport failure the payload is parked in `localStorage`
(`zuca_waitlist_queue_v1`, max 10) and replayed on next mount and on the `online`
event. It contains an email address. If your headers or storage policy conflict
with that, tell me and I'll drop it — but then an offline submit is simply lost.

---

## → For Emil — decisions I need from you

1. **Price discrepancy.** The site said **$28 / box of 12** ($2.33 a unit); the
   brief says the target is **$2.99 a unit** ($35.88 / 12). Those are different
   products or a stale number. I removed the `$28` block from the hero and the
   footer — it sat directly above "what would you pay for a 12-pack?" and would
   have anchored every answer. The FAQ now says "we're targeting about $2.99 a
   bite". **Confirm which number is right.**
2. **Allergens.** The FAQ states "Contains tree nuts (including almonds and
   pecans)". Almonds came from your brief, pecans from the Maple Pecan flavor.
   **Confirm the exact allergen panel before the campaign sends** — this is a
   legal requirement, not a copy choice, and I don't have the spec sheet.
3. **Analytics tool.** Nothing is installed. Events buffer and auto-forward the
   moment `window.plausible`, `window.dataLayer`, or `window.gtag` exists. Say
   the word and I'll add a cookieless script tag — no banner needed.
4. **"Pre-orders" vs "waitlist".** 130+ pre-orders is a fact about the past and I
   kept it as proof. But the CTA now takes no payment, so I moved all
   forward-looking language to first-access framing. If you are actually taking
   pre-orders, that's a different funnel and I should build it differently.

---

## Claim guardrails — what I removed and why

Every one of these was live on `main`:

| Removed | Where | Why |
|---|---|---|
| "Your gut is **sick**. Fix it." | Hero `<h1>` | Implies the product mitigates a condition. |
| "the snack brand that **clinicians recommend**" | Intro gate | "Physician-recommended" is explicitly forbidden. |
| "A **chronic disease** epidemic. We build the snack that actually addresses it." | Hero body | Product + disease in one claim. |
| "Reversed **autoimmune disease** through diet" | Kelley's credentials | Named condition sitting next to the product. Biographical, but on a product page it reads as a claim. |
| "**Clinician-formulated**" ×2 | Product + footer | Implies clinical endorsement. Replaced with the brief-allowed "Developed with input from 10+ physicians across 7 specialties". |
| "**Weight management**" | Motivation dropdown | Weight-loss framing. Not in the contract enum either. |
| "Your gut is sick. Give it fiber." | Footer `<h2>` | Same as the hero. |
| "0g **Refined** sugar" | Hero stat row | Unverified. The brief says *no added sugar*. Now "0g Added sugar". |

**Borderline lines I wrote in the safe form,** flagged per the brief:

- Every fiber statement is nutrient-content or population-statistic only:
  "10g of fiber", "about 40% of your daily fiber", "95% of American adults and
  kids fall short on fiber". No structure/function claim is attached to an outcome.
- The FAQ says the pulp "is made in facilities that comply with 21 CFR 117"
  — a factual statement about the facility, not an implication of FDA approval.
  Cooley is described as advising the company, never as endorsing it.
- `referral_source: doctor` is labelled "A doctor or dietitian". This asks how
  the *user* heard about Zuca. It is not a recommendation claim and the enum is
  fixed by the contract, but it is the closest line to the boundary — say the
  word and I'll relabel it "Through a healthcare professional".
- `is_clinician` is asked as a plain factual question about the person. It must
  never be turned into "trusted by clinicians" copy on the strength of the answers.

---

## Files I own and changed

```
src/content/copy.js                              new — all copy, A/B swappable
src/lib/analytics.js                             new — funnel + UTM capture
src/components/waitlist/WaitlistForm.jsx         new — orchestrator, lazy step 2
src/components/waitlist/Step1Email.jsx           new
src/components/waitlist/Step2Profile.jsx         new — lazy chunk
src/components/waitlist/Confirmation.jsx         new — lazy chunk
src/components/waitlist/primitives.jsx           new — minimum viable ui/
src/components/waitlist/fields.js                new — contract enums + labels
src/components/waitlist/api.js                   new — contract client + queue
src/components/waitlist/store.js                 new — shared state, 2 instances
src/components/waitlist/waitlist.css             new
src/components/waitlist/tokens.fallback.css      new — DELETE ON UX MERGE
src/components/content/sections.jsx              new — proof, numbers, FAQ
src/components/content/sections.css              new
src/zuca-gate-v4.jsx                             edited — see below
docs/screenshots/*.png                           new — 18 states at 390/360px
```

`src/zuca-gate-v4.jsx` is the whole site in one file, so I could not avoid it.
My edits there are deliberately surgical: swap copy for `src/content/copy.js`
imports, delete the old modal, mount `<section id="waitlist">`, wire both CTAs,
add the gate skip, add `NumberBlock` + `Faq`. **I did not touch the `css` template
string, the cursor, the grain canvas, or the page transition.**

Note: the brief specifies `src/lib/analytics.ts`. This repo is plain JS with no
`tsconfig`, so it is `analytics.js` to match. Rename freely if TS lands.

## Pre-existing issue I did not fix

`npm run lint` reports one error on `main` that is not mine:
`src/zuca-gate-v4.jsx:44` — `Cannot access variable before it is declared`
(`animRing` self-references inside its own `useCallback`). It is in the cursor
hook, which is UX-owned. Unchanged from `main`.
