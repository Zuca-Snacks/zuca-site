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

### 5. The intro gate is yours to remove

Decision (Emil, 15 Aug): **the gate goes away for everyone** — no conditional
skip — and the ZUCA logo moment folds into the hero as a fast, non-blocking
entrance. One behaviour, no branching.

I had briefly shipped a UTM-based skip. **It is now removed**: `zuca-gate-v4.jsx`
is back to the unconditional gate, and no growth code branches on campaign
traffic. UTM *capture* is untouched — `page_view` still carries a `campaign`
flag, and every payload still carries the contract's `utm` object.

Two consequences for you:

- **On my branch alone the gate is still there.** Merge order is UX →
  Conversion → Security, so your removal lands first and mine inherits it.
  Nothing in my code depends on `page-a`, `veil`, or `productIn` existing.
- `introLines` in `src/content/copy.js` holds the three claim-safe tagline lines
  (the old ones said "the snack brand that **clinicians recommend**" — not
  usable). If the hero entrance reuses a tagline, take it from there. If nothing
  uses it, tell me and I'll delete the export.

### 6. Layout bugs I found but did not fix (yours)

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

### 3. Consent evidence — contract amendment of 15 Aug 2026

**What I send.** Every payload — step 1 and step 2 — now carries
`consent_text_version`, a stable identifier for the exact wording the user was
shown. It is derived in `src/components/waitlist/consent.js` as:

```
<purpose>-<region>-<authored>-<fingerprint>
mkt-us-2026-08-15-7d912cf1
mkt-eea-2026-08-15-55babc95
mot-all-2026-08-15-14d950d1
```

The fingerprint is an FNV-1a hash of the exact rendered string, **including the
privacy link's label and href** — a consent that pointed at a different privacy
notice is a different consent. Because it's derived rather than hand-written,
editing a word in `src/content/copy.js` changes the version automatically. A
hand-maintained version number is worse than none: it looks like evidence right
up until someone edits the text and forgets to bump it.

**What I deliberately do NOT send.** `consent_timestamp` and `country` are
absent from the payload and must stay that way. A client-supplied timestamp is
not evidence and a client-supplied country is not a fact — both are trivially
forged and neither would survive being relied on. There is an explicit comment
in `api.js` saying so, so nobody "helpfully" adds them.

**`motivation_consent_text_version` — live, and the `+` interim is deleted.**
Both identifiers now travel in their own fields. The interim that joined them
was not merely superseded — **it was invalid**: `consentVersionField()`
constrains ids to `/^[A-Za-z0-9._-]+$/`, and `+` is not in that set. Every
step-2 submit from someone who ticked the health box would have 400'd and lost
the whole profile. It is removed rather than left behind a boolean.

**You must store the wording, not just the version.** A version identifier is
only evidence if the text it points at is retained immutably. The strings live
in `src/content/copy.js` and are therefore in git history, but git history is
not a compliance record — please snapshot `version → exact text` server-side at
write time.

### 3b. What I found verifying against your shipped code

I ran my real version ids and real `buildPayload()` output through
`origin/sec/hardening:src/lib/validation.js` rather than reading the handoff
prose. Three things did not match, two of them silent data loss:

| # | Finding | Status |
|---|---|---|
| 1 | **`+`-joined ids fail `consentVersionField()`.** `/^[A-Za-z0-9._-]+$/` excludes `+`, so every health opt-in would have 400'd. | Fixed — dedicated field, join deleted. |
| 2 | **I was never sending `consent_health`.** It is in your schema, it defaults to `false`, and your comment says `motivation` is *dropped entirely* without it. It is not in the contract in `AGENTS_BRIEF.md`, so I had no way to know it existed without reading your code. **Every health answer collected so far would have been silently discarded.** | Fixed — sent explicitly on every payload, including `false`. |
| 3 | **My health id `mot-all-…` parsed as `unknown` regime.** Not currently a wrong flag (only `us` triggers), but it left `health_regime` unauditable on every record, and any future rule that treats `unknown` as suspect would have been blind. | Fixed — now `mot-eea-…`, which your parser reads as `eea`. |

On the audience token: **your code is already right and your prose is stale.**
`consentRegime()` accepts `['eu','eea','gdpr','uk']`, so my `mkt-eea-…` resolves
correctly — but §1e-bis of your handoff asks for `mkt-eu-`. Worth fixing the
prose so the next person doesn't standardise on the wrong one.

Verified end-to-end against your actual `waitlistSchema` and
`reconcileConsentRegime`:

```
regime      mkt-us-2026-08-15-7d912cf1   → us
            mkt-eea-2026-08-15-0dd5ad8b  → eea
            mot-eea-2026-08-15-14d950d1  → eea      (was: unknown)

schema      step 1 only                  ✓ valid
            step 2, health opted IN      ✓ valid   consent_health true,  motivation kept, mot version set
            step 2, health opted OUT     ✓ valid   consent_health false, motivation null,  mot version null

reconcile   DE + EEA copy → not flagged   mkt eea / health eea
            DE + US  copy → FLAGGED       mkt us  / health eea
            US + US  copy → not flagged   mkt us  / health eea
```

`motivation` is now also dropped client-side unless `consent_health` is true, so
the data cannot outlive its opt-in on either side of the wire.

**One thing for you.** `consent_health` is a required part of the record but is
not in the frozen contract in `AGENTS_BRIEF.md`. Please add it there — I only
found it by reading your source, and the next agent to code against the brief
will hit the same silent drop.

### 4. Region-based consent wording

EEA/UK visitors get explicit opt-in wording naming what we send and how often;
everyone else gets the US phrasing. **Same single unchecked checkbox either way
— only the sentence changes.** No country-based form branching beyond that.

`country` is server-derived, so the client cannot know it at render time.
Rather than block the hero on a lookup, the client guesses the region from the
browser's IANA time zone — no network call, no cookie, no IP handling — and the
guess is **deliberately biased toward the strict wording**: anything uncertain,
unparseable, or `Europe/*` resolves to EEA. Explicit wording is never wrong in
the US; the softer US wording shown in the EEA is a violation.

**The guess being wrong doesn't corrupt the evidence**, which is the point of
doing it this way — `consent_text_version` records what was *actually rendered*.
That gives you a reconciliation you should run:

> if server-derived `country` ∈ EEA/UK **and** stored `consent_text_version`
> starts with `mkt-us-` → that person saw the weaker wording. Flag for
> re-consent before including them in an EEA send.

I expect this to be a small number (VPNs, travellers, misconfigured clocks), but
it will not be zero.

### 5. Bot signals I already send

- `hp_field` — honeypot, off-screen (not `display:none`). Must be empty.
- `form_render_ts` — ms epoch stamped once per form mount. `<2s` to submit = bot.
- Both are in every payload, including the fallback path.

### 6. `/privacy` link — no action needed

The consent checkbox links to `/privacy` (`step1.privacyHref` in
`src/content/copy.js`). It 404s on my branch and that is expected: you build
those pages on `sec/hardening` and the link resolves once all three branches
merge. Confirmed with Emil — **the link stays as-is.**

Only tell me if the real path is something other than `/privacy`; that's a
one-line change.

### 7. Failed submissions are queued client-side

On total transport failure the payload is parked in `localStorage`
(`zuca_waitlist_queue_v1`, max 10) and replayed on next mount and on the `online`
event. It contains an email address. If your headers or storage policy conflict
with that, tell me and I'll drop it — but then an offline submit is simply lost.

---

## → Decisions taken (Emil, 15 Aug 2026)

1. **Intro gate: removed for everyone**, not conditionally skipped. UX owns the
   change; my UTM-based skip is gone and no growth code branches on traffic
   source. UTM capture and attribution are unaffected. Details in the UX
   section above.
2. **No figures of any kind on the page — in either direction.**

   *Retail price.* The page is measuring willingness to pay, and any figure
   corrupts the `price_band` answer. The hero and footer `$28 / box of 12`
   blocks are gone, and the "What will it cost?" FAQ names no number — it says
   the price isn't fixed and points at the step 2 question, which turns the
   objection into a reason to answer. Verified D2C reference is **$2.99/unit**;
   the $28 figure was stale. `price_band` stays framed as a 12-pack.

   *Input costs.* The pulp disposal figure (**$25/ton**) is removed everywhere:
   it is supplier-negotiation and competitor-intelligence information, and to a
   consumer it reads "cheap" rather than "clever". Headline variant B was built
   entirely on that number and is rewritten — it now reads *"Juiceries throw the
   fiber away. We rescued it and turned it into dessert."* The pulp FAQ keeps
   the rescue story with no economics in it.

   **The upcycling story stays; no number is ever attached to it.** There is a
   standing note at the top of `src/content/copy.js` stating this, so a figure
   doesn't creep back in.

   Verified against the production bundle: the only dollar strings that ship are
   the five `price_band` *answer options*, which are the question itself and are
   fixed by the frozen contract.
3. **Allergens: publish only what is certain.** Both flavors contain tree nuts —
   almonds and pecans — and that is stated plainly in the three-number block
   footnote and in full in the FAQ. **Nothing else is published.** Gluten/oats
   status, dairy in the Chocolate Raspberry Sea Salt, and shared-facility
   cross-contact are all absent by design, pending written confirmation from
   Step Change Innovations. The allergen FAQ ends with "We're not publishing a
   guess."

   ⚠️ **There is a BLOCKING TODO at the top of `src/content/copy.js`** listing
   exactly what is unconfirmed. **Do not add any of those items, and do not
   soften that FAQ line, until Emil has the manufacturer's written
   confirmation.** This is the one item on this branch that must be closed
   before a large list reads the page.
4. **`/privacy`** — expected 404 on this branch, resolves on merge. No change.

## Historical sheet reconciliation

The live sheet already holds rows from the old pre-order modal, with their own
value sets:

```
Reason:         fiber, gut, sustainability, weight, other
How They Heard: friend, stanford, social, physician, other
```

The contract enums are frozen, so I reconciled in code rather than changing
either side. **`LEGACY_MAP` and `DISCONTINUITIES` in
`src/components/waitlist/fields.js`** are the authority — apply `LEGACY_MAP` to
old rows to unify each column.

| Legacy | → New | Note |
|---|---|---|
| `gut` | `gut_health` | Clean 1:1. |
| `sustainability` | `sustainability` | Unchanged. |
| `other` | `other` | Unchanged, both columns. |
| `friend` | `friend` | Clean 1:1. |
| `physician` | `doctor` | Same concept; the contract spells it `doctor`. I changed the visible label from "A doctor or dietitian" to **"A physician"** so the wording stays continuous. |
| `fiber` | — | **No successor.** It was the general "I want more fiber" reason; the new options split that across `digestion`, `regularity`, `gut_health`, `energy`, `family_health`. For period comparison, treat legacy (`fiber` + `gut`) as the union of those five. Do **not** bucket it into `other`. |
| `weight` | — | **Retired.** Weight-loss framing is forbidden by the claim guardrails, so it is not offered as a new option. Historical rows keep the value — don't rewrite or delete them — but the series ends at the cutover. |
| `social` | `instagram` + `tiktok` | **Split.** Legacy rows can't be attributed to a platform after the fact, so platform-level series start at the cutover. For a continuous series, sum `instagram + tiktok` against legacy `social`. |
| `stanford` | — | **No successor.** The contract enum has no equivalent and adding one would break the frozen contract. New rows from that channel land in `event` or `other`, so this is a closed series. UTMs are the better instrument for it now. |

### ⚠️ The column *names* changed too — this needs action on the Apps Script

The old modal posted `{name, email, phone, hearAbout, reason, ts}`. The contract
payload posts `{email, zip, motivation, intent, price_band, flavor,
is_clinician, referral_source, consent_marketing, utm, page_path, hp_field,
form_render_ts}`.

**`hearAbout` → `referral_source` and `reason` → `motivation`.** If the Apps
Script maps a fixed set of keys to columns, every step-2 answer is silently
dropped on the fallback path — which is the *only* live path until
`/api/waitlist` ships.

I deliberately did **not** alias the new values back into the legacy
`hearAbout` / `reason` columns. Writing `motivation: "digestion"` into a column
whose historical domain is `fiber|gut|sustainability|weight|other` would corrupt
exactly the continuity we're trying to preserve. New columns, plus the mapping
table above, keeps both eras clean.

**Emil — the Apps Script is yours; it needs the new columns added before the
campaign sends.** I don't own that file and haven't touched it.

### `zip` is hidden for non-US visitors

The contract fixes `zip` to `/^[0-9]{5}$/` — a US postcode — while the outreach
list spans four continents. The field is now **not rendered at all** for anyone
the time-zone guess places outside the US. A field someone has to be told to
skip is still friction on the only screen that matters.

The postal detector biases the *opposite* way to the consent one, deliberately:

| Detected | Behaviour |
|---|---|
| `us` (incl. PR, USVI, Guam, Saipan, American Samoa — all on 5-digit ZIPs) | Field shown, no hint. It's their own postcode. |
| `non_us` | Field not rendered. Never validated, always sent as `null`. |
| `unknown` (no `Intl`, unresolvable zone) | Field shown **with** the "US only — skip this if you're somewhere else" hint. This is what the hint is for. |

Consent fails toward strict because the downside is a regulator; postal fails
toward showing because the downside is one optional data point. Both biases are
documented at the top of `src/components/waitlist/region.js`.

Verified across `America/New_York` (shown), `Pacific/Guam` (shown),
`Europe/Berlin`, `Asia/Tokyo`, `America/Sao_Paulo` (all hidden), and all three
ambiguous paths — no `Intl`, throwing `Intl`, empty time zone (shown + hint).

`step2_view` and `step2_submit` now carry `postal_region`, so you can see how
much of the list this actually affects.

**Demand-clustering data is therefore US-only by design.** Given `country` is
now server-derived, leaning on that is probably cheaper than widening `zip` to a
free-form international postal string (`SW1A 1AA`, `100-0001`). Your call — no
change needed from me unless you want the wider field.

### Cadence is a promise, not copy

The EEA wording commits to **"about two emails a month, plus a short series when
we launch."** GDPR requires a clear statement of what will be sent and how
often, so a number had to be there — and the launch sequence is named up front
rather than quietly breaking the promise in week one.

This is an operational constraint on the sending schedule. If the real cadence
changes, tell me and I'll change the text, which mints a new consent version
automatically — exactly as it should. That is not a cost to avoid; it is the
mechanism working.

The change from the first draft moved the EEA version from `…-55babc95` to
`…-0dd5ad8b` with no version number touched by hand. US and motivation versions
are unchanged, which is the other half of the property: **only the wording that
actually changed mints a new identifier.**

### Motivation question is now behind a disclosure

Per Emil: the health block sits behind **"Want to help shape what we make?"**,
collapsed by default. **Consent order is preserved** — opening it reveals the
opt-in checkbox *first*, with the chips disabled until it is ticked. Collecting
first and asking after would have been cheaper on space and would not have been
consent.

Native `<details>`, so no JS, keyboard-complete, and the collapsed height is
stable — opening it cannot shift anything above it. Closing it also clears the
opt-in and the selections, so a collapsed panel can never hide data we are still
holding.

Measured at 390px: the step 2 card is **1506px collapsed, 2072px open — 566px
saved** for everyone who doesn't open it.

`step2_motivation_open` is instrumented, so the take-up rate is visible rather
than assumed.

### Still open

- **Analytics tool.** Nothing is installed. Events buffer and auto-forward the
  moment `window.plausible`, `window.dataLayer`, or `window.gtag` exists. Say
  the word and I'll add a cookieless script tag — no banner needed.
- **"Pre-orders" vs "waitlist".** 130+ pre-orders is a fact about the past and I
  kept it as proof. But the CTA now takes no payment, so all forward-looking
  language is first-access framing. If you are actually taking pre-orders,
  that's a different funnel and I should build it differently.

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
