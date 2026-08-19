// ─── Zuca conversion copy ────────────────────────────────────────────────────
// Single source of truth for every headline, CTA label, and FAQ answer on the
// page. A/B READINESS: change ACTIVE_HEADLINE / ACTIVE_CTA below to swap the
// tested copy. Nothing else in the codebase hardcodes a headline or a button
// label, so a test is a one-line edit here.
//
// CLAIM GUARDRAILS (see AGENTS_BRIEF.md): Zuca is a food, not a drug. Nothing
// in this file may state or imply that Zuca treats, prevents, cures, or
// mitigates a disease. No named diseases. No "physician-recommended",
// "doctor-approved", "clinically proven", or weight-loss framing. Structure/
// function and factual nutrient-content statements only.
//
// ── ALLERGENS: CONFIRMED, BUT NOT STABLE ────────────────────────────────────
// Confirmed 18 Aug 2026: both flavours contain TREE NUTS — almonds and pecans.
// That is what the site says and it is accurate today.
//
// ⚠️ THE RECIPE IS STILL MOVING. The nut base may change from almond to
// SUNFLOWER butter, with pecan remaining in Maple Pecan. If that lands, the
// panel changes and so does the shape of the claim: one flavour would carry
// tree nuts and the other might not, which is a per-flavour allergen statement
// rather than the shared one we have now. Do not build anything — pills,
// filters, segments, email cohorts — that assumes this panel is permanent.
//
// ❌ NEVER CLAIM GLUTEN-FREE. Unconfirmed, and a separate question from the
// recipe: a gluten-free recipe made on a shared line is not a gluten-free
// product. The `gluten_free` chip in fields.js is the USER describing their
// diet; it is not evidence about Zuca and must never be read as such.
//
// Also still unconfirmed and therefore unstated: dairy in the Chocolate
// Raspberry Sea Salt, and shared-facility cross-contact. Do not add either,
// and do not soften the "We're not publishing a guess" line in the allergen
// FAQ, until confirmation exists in writing.

// ── PRICING — NO FIGURES OF ANY KIND ON THIS PAGE ────────────────────────────
// This applies to BOTH directions:
//   • Retail price. The waitlist measures willingness to pay via price_band;
//     any figure on the page anchors the answer. Verified D2C reference is
//     $2.99/unit (the old $28 / 12-pack figure was stale) — internal only.
//   • Input costs. The pulp disposal figure is supplier-negotiation and
//     competitor-intelligence information, and to a consumer it reads "cheap"
//     rather than "clever".
// Keep the upcycling story — fruit that was going to be thrown away, rescued
// and made into something good — with no number attached to it.

// ─── Headline variants ───────────────────────────────────────────────────────
// Three tested-ready variants. See HANDOFF-growth.md for the reasoning.
//
// ⚠️ CREDENTIAL LINE — DO NOT REINTRODUCE INTO THESE SUBHEADS.
// All three subheads originally ended with "by a Michelin-trained chef and a
// Stanford physician". They were written against a page that had no separate
// credential line. The merged hero renders `introLines[0]` — the same claim,
// verbatim — directly above the headline, so every variant stated it twice
// inside the first viewport. That reads as an editing mistake and it dilutes a
// line doing real trust work, which is why it was cut here rather than trimmed
// for space (Emil, 16 Aug — the tagline itself is protected and stays).
// The credential appears exactly once in the hero, in the tagline.
export const HEADLINES = {
  // A — taste first, origin second. Deliberately carries NO figures: the
  // redesigned hero renders the 10g stamp and the 10g/150kcal/4g spec row
  // directly above this line, so "10g of fiber. 150 calories." was the picture
  // and the sentence saying the same thing twice.
  //
  // Taste leads on purpose. With appetising product photography immediately
  // above, opening on a discard word ("landfill", "thrown away") puts a
  // negative directly under the food. Leading with the taste lets the photo and
  // the first sentence agree, and the origin then lands as the surprise it is.
  //
  // DECIDED — Emil, 16 Aug 2026: taste-first is final. The origin-first
  // inversion ("Made from what juicing throws away. Tastes like dessert.") was
  // considered and rejected. Not an open question; do not reopen it as one.
  //
  // ── RESERVED ALTERNATIVE — NOT APPROVED. DO NOT SHIP WITHOUT EMIL. ────────
  // Kept here because the next person to hit the fold constraint will
  // otherwise redo this work, or ship the short version without knowing it
  // needs sign-off.
  //
  //     "Dessert, made from what juicing throws away."      (44 chars)
  //
  // Two gates, both open before it goes live:
  //
  //   1. TYPE STEP. This only matters if the hero headline moves up to
  //      --z-step-3. It is deliberately held at --z-step-2 today: the larger
  //      step costs 22-35px of fold clearance, and the fold still has to
  //      survive the product photo reshoot. Re-check that it is actually
  //      unblocked rather than assuming — as of 16 Aug it is not.
  //
  //   2. EMIL, SPECIFICALLY. It buys its characters by dropping "Tastes
  //      like", which turns a claim about the EXPERIENCE into an assertion of
  //      the CATEGORY. On a food product under FDA scrutiny those are
  //      different kinds of statement, and a fiber snack flatly calling itself
  //      dessert also undercuts the fiber positioning it is trying to earn.
  //      Low risk, not zero — his call, not ours.
  //
  // CHARACTER BUDGET, measured by UX at 360/390/430 — do not re-measure:
  //   ~46-48 chars buys --z-step-3. The current 56 wraps to five lines at
  //   360px at that step and pushes the CTA 35px past the fold (22px at 390,
  //   15px at 430). It needs exactly one line less at every width.
  //
  // ALREADY TRIED AND REJECTED. The reasons generalise — anyone writing the
  // next headline will hit both traps:
  //   (50) "Tastes like dessert. Made from rescued apple pulp."
  //        Loses the discard story, and bare "pulp" reads cheap rather than
  //        clever — the same failure Emil called out on the $25/ton figure.
  //   (51) "Tastes like dessert. Made from juicing's leftovers."
  //        Negative-adjacency again in a new word: a discard term sitting
  //        directly beneath appetising product photography.
  //   (50) "Tastes like dessert. From what juicing throws out."
  //        Still over budget, and clumsier than the line it would replace.
  // ─────────────────────────────────────────────────────────────────────────
  a: {
    id: "a",
    headline: "Tastes like dessert. Made from what juicing throws away.",
    subhead:
      "Two flavors, no refined sugar, and about 40% of your daily fiber in one bite.",
  },
  // B — origin story first. Best story, but asks the reader to care about
  // juiceries before they care about the snack.
  b: {
    id: "b",
    headline: "Juiceries throw the fiber away. We rescued it and turned it into dessert.",
    subhead:
      "10g of fiber, 150 calories, no refined sugar. Chocolate Raspberry Sea Salt or Maple Pecan.",
  },
  // C — category stat first. Highest-context, but opens on the reader's deficit
  // rather than on the product.
  c: {
    id: "c",
    headline: "95% of Americans don't get enough fiber. This is 10 grams of it, and it tastes like dessert.",
    subhead:
      "150 calories. No refined sugar. Made from apple pulp a juicery was about to throw away.",
  },
};

// ← FLIP THIS to run a headline test.
export const ACTIVE_HEADLINE = HEADLINES.a;

// ─── CTA label variants ──────────────────────────────────────────────────────
// Labels describe the outcome, never the mechanic. No "Submit", no "Sign up".
export const CTAS = {
  outcome: { id: "outcome", step1: "Get first access", step1Busy: "Getting your spot…" },
  early: { id: "early", step1: "Claim my early spot", step1Busy: "Claiming…" },
  simple: { id: "simple", step1: "Put me on the list", step1Busy: "Adding you…" },
};

// ← FLIP THIS to run a CTA test.
export const ACTIVE_CTA = CTAS.outcome;

// ─── Hero ────────────────────────────────────────────────────────────────────
export const hero = {
  eyebrow: "Waitlist open · First run is limited",
  headline: ACTIVE_HEADLINE.headline,
  subhead: ACTIVE_HEADLINE.subhead,
  // Shown directly under the email field. Removes the two objections that stop
  // an email being typed: what happens next, and how hard is it to leave.
  reassurance: "One email. No payment, no spam, unsubscribe in one click.",

  // ── Count band fallback ─────────────────────────────────────────────────
  // Occupies `.z-hero__count` whenever the live waitlist number is absent.
  // Per Hero.jsx that is EVERY visit until the count endpoint is configured,
  // so this is not edge-case copy — it is the default state of that band, and
  // it should do conversion work rather than merely fill the space.
  //
  // Why this line and not another fact: the band's job is to give a reason to
  // type an email. With no number available, the nearest honest substitute is
  // not a different fact about fiber — it is the one thing the hero never
  // says, which is what joining actually gets you. Everything else true about
  // Zuca is already on screen above it: the chef and physician (tagline), the
  // taste and the origin (headline), the flavours and the figures (name
  // plates, spec stacks, subhead, big figure), and the terms of joining
  // (microcopy). Restating any of those would trade a reason to act for an echo.
  //
  // Backable without qualification: it is exactly what the confirmation
  // timeline already promises ("one email with the ship date and your ordering
  // window, ahead of the public"), so it creates no obligation that is not
  // already made. No number, no price, no scarcity claim.
  //
  // FITS THE RESERVED HEIGHT — measured, not estimated. `.z-hero__count`
  // reserves min-height 3.25rem (52px); the fallback renders at --z-step-0
  // (~16px at 360px) inside max-width 30ch, so the band holds exactly two
  // lines. This wraps to 2 at 360px:
  //     "You'll hear the ship date / before it's public."
  // Budget for any replacement: <=~55 chars AND verify it wraps to <=2 lines
  // at 30ch — character count alone is not sufficient, wrap waste decides it.
  //
  // WORDS THIS LINE MUST AVOID. Supplying `countFallback` sets
  // `usingInterimFallback` false in Hero.jsx, which brings the eyebrow badge
  // BACK — so this line and the eyebrow are on screen together, not in
  // alternation. A first draft opened "Waitlist members hear..." directly
  // beneath "Waitlist open - First run is limited": different information,
  // but two lines in one viewport opening on the same word. Avoid "waitlist"
  // (eyebrow), "first" and "access" (eyebrow and the CTA), and the figures
  // and flavour names carried by the spec stacks and subhead.
  //
  // DECIDED — Emil, 17 Aug 2026: this line, on the reasoning above. Chosen
  // because it is the only candidate that gives someone a reason to type an
  // email rather than restating something already on screen. Settled, not a
  // default someone landed on.
  //
  // ALTERNATIVE CONSIDERED, not shipped:
  //   (41) "95% of Americans don't get enough fiber."
  //        Fits, and is explicitly allowed by the brief as a population
  //        statistic rather than a product claim. Rejected for two reasons:
  //        it opens on the reader's deficit directly beneath appetising
  //        product photography, the same negative-adjacency problem that put
  //        taste first in the headline; and it is variant C's opening clause
  //        verbatim, so activating C would put the same sentence on screen
  //        twice. If C is ever made ACTIVE_HEADLINE, this line must change.
  countFallback: "You'll hear the ship date before it's public.",
};

// ─── Proof strip ─────────────────────────────────────────────────────────────
// Specificity is the trust mechanism. Every line is a verifiable event.
//
// ── NO PRE-ORDER LANGUAGE ────────────────────────────────────────────────────
// No payment has been taken, no order exists, and no contract of sale has been
// formed, so nobody here may be described as having pre-ordered or reserved
// anything. Past and present tense about the existing signups: they joined a
// waitlist. Future tense ("when pre-orders open") is accurate and fine.
// `/terms` already says joining is not a purchase — the site must not
// contradict its own terms.
//
// The same rule caught "sold out at a physician symposium": the samples ran
// out, they were not sold. It asserts a transaction that did not happen,
// exactly like "reserved" does.
//
// The waitlist size is NOT hardcoded here. It reads live from the sheet, so it
// self-corrects when test rows are removed rather than baking a number into
// copy that then becomes a claim we have to defend.
export const proof = {
  liveLabel: "already on the waitlist",
  items: [
    { value: "45 min", label: "for samples to run out at Stanford Demo Day" },
    { value: "Day 1", label: "samples gone at a physician symposium" },
  ],
};

// ─── Three-number block ──────────────────────────────────────────────────────
// ── SUGAR: ONE CLAIM IS PERMITTED, AND ONLY ONE ────────────────────────────
// Confirmed by the manufacturer, 18 Aug 2026:
//   ✅ "No refined sugar."  TRUE of BOTH flavours. This is the claim to make,
//      and it is the ONLY sugar claim allowed on the site.
//   ❌ "No added sugar."    FALSE — maple syrup is added as a sweetener, and
//      syrups are added sugars under FDA rules.
//   ❌ "6g natural sugar."  FALSE — some of that sugar is added, not naturally
//      occurring in the fruit.
//
// ⚠️ NO SITE-WIDE SWEETENER CLAIM. Maple syrup is in MAPLE PECAN ONLY. What
// sweetens Chocolate Raspberry Sea Salt is still unconfirmed, so anything more
// specific than "No refined sugar" — naming maple, naming any sweetener,
// "sweetened with…" — is a per-flavour claim wearing a site-wide coat. The
// pills render on BOTH cards; the subheads cover both. Hold until confirmed.
//
// Do not "improve" this into a positive sweetener statement. Naming the
// sweetener would be better copy, and we cannot yet do it truthfully for half
// the range.

export const numbers = {
  title: "What's actually in one.",
  items: [
    { value: "10g", unit: "fiber", note: "About 40% of your daily fiber, and twice what the leading bars carry." },
    { value: "150", unit: "calories", note: "Plus 4g of protein." },
    { value: "4g", unit: "protein", note: "Enough to make it a snack rather than a treat." },
  ],
  footnote: "Per serving. No refined sugar. Contains tree nuts — almonds and pecans.",
};

// ─── Section headers ─────────────────────────────────────────────────────────
export const sections = {
  waitlist: {
    title: "Be first when the first run ships.",
    body: "The first production run is limited, and the waitlist gets it before anyone else.",
  },
  product: {
    title: "Two flavors. Same 10 grams.",
    body: "Developed with input from 10+ physicians across 7 specialties, and cooked by someone who spent his twenties in a two-Michelin-star kitchen.",
  },
  founders: {
    title: "A chef and a physician.",
    body: "Zuca was created by a Michelin-trained chef and a Stanford Medicine physician.",
  },
  faq: {
    title: "The questions everyone asks.",
  },
  /* Labels the taster-quote group so the boundary between the <h1> and the
     testimonials is explicit rather than implied. CONFIRMED BY EMIL 18 Aug —
     no longer the UX placeholder it shipped as.
     Stored in sentence case and uppercased in CSS: a screen reader may spell
     out an all-caps string letter by letter, and the visual result is
     identical either way.
     ⚠️ It must stay a LABEL. It may not connect the quotes to a benefit —
     "Why people love the fiber" turns five taste opinions into evidence for a
     health claim, which the guardrails forbid. */
  quotes: {
    eyebrow: "What tasters say",
  },
};

// ─── Intro gate (organic visitors only) ──────────────────────────────────────
export const introLines = [
  "A Michelin-trained chef and a Stanford physician,",
  "turning what juiceries throw away",
  "into 10 grams of fiber.",
];

// ─── Founder credentials ─────────────────────────────────────────────────────
// ⚠️ ROLES SET BY EMIL, 17 Aug — "Emil Nordin — Founder & CEO", "Kelley Yuan —
// Founding CMO". They replaced "Chef & Co-Founder" and "Physician &
// Co-Founder". Growth owns this file; UX made the edit because Emil gave the
// exact strings. Flagged in HANDOFF-ux.md. Note that Kelley's NAME was left as
// "Kelley Yuan, MD" — Emil wrote it without the postnominal, but he was giving
// a title, not renaming her, and the MD is load-bearing next to the clinical
// credentials below. Confirm before changing it.
//
// ⚠️ EVERY LINE HERE IS BIOGRAPHY. These are facts about two people. None of
// them is a statement about what Zuca does, and none may be rewritten into one.
// The distinction is the whole basis on which they are publishable: a personal
// history is not a product claim, and it stops being a personal history the
// moment it is phrased as an outcome the reader might expect.
export const founders = [
  {
    name: "Emil Nordin",
    role: "Founder & CEO",
    creds: [
      "Won a national cooking competition watched by ~10% of Norway's population",
      "Named Norway's Most Promising Young Chef",
      "Trained at Restaurant Kontrast (two Michelin stars and a Michelin Green Star)",
      "Hosted his own show on Norway's national food channel",
      "BSc in Bioengineering and Food Systems Design, Stanford",
    ],
  },
  {
    name: "Kelley Yuan, MD",
    role: "Founding CMO",
    creds: [
      "Stanford Medicine physician",
      "Stanford Sustainability Fellow",
      "Leads Zuca's clinical network: 10+ physicians across 7 specialties",
      // ⚠️⚠️ THE STRONGEST IMPLIED MEDICAL CLAIM ON THE PAGE. Added on Emil's
      // instruction, 18 Aug 2026, and FLAGGED FOR COOLEY REVIEW — counsel is
      // to bless this explicitly rather than have us assume it is fine.
      //
      // It is written as something that happened to HER, in the past, with the
      // agent named as her diet — not as something Zuca does, not as an
      // outcome, and not adjacent to any product statement. Do not:
      //   • name the condition
      //   • move it next to a claim about the product
      //   • let it become "our CMO reversed disease with food, and this is that
      //     food" — which is what a reader supplies for free if we let the two
      //     sit together
      // A disease-reversal line beside a product we sell is the highest-risk
      // sentence on the site. Its safety is entirely in the framing, so the
      // framing is not editorial preference.
      "Reversed her own autoimmune disease through a plant-based diet",
    ],
  },
];

// ─── Objection-handling FAQ ──────────────────────────────────────────────────
// Ordered by what actually stops a purchase, not by what's easiest to answer.
export const faq = [
  {
    q: "What does it actually taste like?",
    a: "Like a dessert someone put effort into, not like a health food. Chocolate Raspberry Sea Salt is tart and deep, with the salt landing at the end. Maple Pecan is warm and toasty and only gently sweet. Both are chewy, not chalky. Emil trained in a two-Michelin-star kitchen and refused to ship anything he wouldn't put on a menu.",
  },
  {
    q: "\"Made from apple pulp\" — is that gross? Is it safe?",
    a: "It's the fruit. When a juicery presses apples, the juice goes in the bottle and the rest of the apple — the fiber, mostly — gets thrown out as waste. That pulp is the same apple you'd eat whole. We rescue it fresh, and it's made in facilities that comply with 21 CFR 117, the FDA's food safety rules for human food. Nothing about it is a byproduct except the accounting.",
  },
  {
    q: "What's in it, and what about allergens?",
    a: "No refined sugar in either flavor. Both contain tree nuts — almonds and pecans. If you have a tree nut allergy, this is not a product for you, and we'd rather say so now than sell you one bite. Per serving: 10g fiber, 150 calories, 4g protein. The full ingredient and allergen panel — including gluten, dairy, and whether it shares a facility with other allergens — goes up the moment our manufacturer confirms it in writing. We're not publishing a guess.",
  },
  {
    q: "What will it cost?",
    // Deliberately no number. The waitlist is measuring willingness to pay, and
    // any figure on this page anchors the price question in step 2. Verified
    // internal reference is $2.99/unit — it stays internal until launch.
    a: "We haven't fixed the price yet, and we're not going to pretend otherwise — what a 12-pack should cost is one of the questions we ask people who join. Joining costs nothing and commits you to nothing: no card, no charge. Waitlist members get the first run at launch pricing, and hear the number before anyone else.",
  },
  {
    q: "When does it ship?",
    a: "The first production run is being scheduled now with our manufacturing partner. Waitlist members get the ship date and the ordering window by email before it goes public. If you'd rather not hear from us again, one click unsubscribes you.",
  },
  {
    q: "Isn't this just another protein bar?",
    a: "No — it's built around fiber, not protein. A typical bar leads with 10-20g of protein and carries 3-5g of fiber. Zuca is 10g of fiber and 4g of protein, roughly twice the fiber of the leading bars. 95% of American adults and kids fall short on fiber; almost nobody falls short on protein. We built for the gap that's actually there.",
  },
  {
    q: "Who's behind it?",
    a: "Emil Nordin, a Michelin-trained chef and Stanford bioengineering student, and Kelley Yuan, MD, a Stanford Medicine physician.",
  },
];

// ─── Consent wording ─────────────────────────────────────────────────────────
// GDPR Art 7(1): if there is no record of what the person was shown, there is
// no consent — regardless of what actually happened. The outreach list spans
// the US, Latin America, Asia and Europe, so this is evidence, not decoration.
//
// These strings are the SOURCE OF TRUTH for what the user saw. The version
// identifier sent to the server is derived from a hash of the exact text (see
// src/components/waitlist/consent.js), so editing a word here changes the
// version automatically. Do NOT hand-write a version, and do NOT edit these
// strings anywhere else — a version that drifts from its wording is worse than
// no version at all, because it looks like evidence and isn't.
//
// `authored` is the date the wording was written. It is cosmetic; the hash is
// what makes the identifier trustworthy.
export const consentTexts = {
  marketing: {
    // US and comparable opt-out regimes.
    us: {
      authored: "2026-08-15",
      text: "Email me about Zuca — launch date, first access, and the occasional note from the kitchen. I can unsubscribe from any email.",
      privacyLabel: "Privacy",
      privacyHref: "/privacy",
    },
    // EEA and UK. GDPR needs a freely given, specific and INFORMED act: it must
    // say what will be sent and how often, and that consent can be withdrawn.
    // Same single checkbox, unchecked, never bundled — only the sentence differs.
    //
    // ⚠️ The stated frequency is an operational promise, not copy. Steady state
    // is about two a month; the launch sequence will exceed that, so it is
    // named here rather than quietly broken in week one. If the real cadence
    // changes, this text changes with it — and that mints a new consent
    // version, which is the correct behaviour.
    eea: {
      authored: "2026-08-15",
      text: "Yes, email me about Zuca. I'm agreeing to receive the launch date, my first-access window, and occasional notes from the kitchen — about two emails a month, plus a short series when we launch, and never anyone else's advertising. Zuca won't email me without this, and I can withdraw it in one click from any email.",
      privacyLabel: "Privacy notice",
      privacyHref: "/privacy",
    },
  },
  // Health-adjacent data, and under GDPR Art 9 the consent most likely to be
  // challenged. Its wording is versioned separately from marketing.
  // Covers BOTH the reason-for-interest chips and the dietary chips. An allergy
  // is health data under Art 9 exactly as a health motivation is, so one
  // explicit opt-in naming both is correct — two separate boxes would be
  // friction without added protection, and either field without a box is
  // unlawful. Wording changed 17 Aug to name dietary needs, which mints a new
  // version automatically.
  motivation: {
    authored: "2026-08-17",
    text: "I'm happy to tell Zuca why fiber matters to me and anything dietary it should know. This is optional, it's stored with my signup, it's never sold and never sent to an ad or analytics tool, and I can ask Zuca to delete it at any time.",
  },

  // ⚠️ TCPA-GRADE. US SMS marketing needs prior EXPRESS WRITTEN consent, a
  // higher bar than the email checkbox: it must identify the sender, say the
  // messages are marketing, say they are automated, state that agreeing is not
  // a condition of buying anything, and disclose that rates may apply. Every
  // one of those clauses is load-bearing — do not trim this for length.
  // Unchecked, separate, and never bundled with the email consent.
  sms: {
    // US — TCPA prior express written consent. Every clause is load-bearing:
    // sender identified, marketing named, automated named, not-a-condition-of-
    // purchase, rates disclosed, STOP given. Do not trim this for length.
    us: {
      authored: "2026-08-17",
      text: "Text me about Zuca. I agree to receive automated marketing texts from Zuca at the number I give — a handful around launch, not a stream. Agreeing is not a condition of buying anything, message and data rates may apply, and I can stop them any time by replying STOP.",
    },
    // EEA/UK — GDPR wants freely given, specific, informed and withdrawable,
    // and says nothing about the TCPA formula. Serving the US string to an EEA
    // number is not a false alarm on the re-consent report: it is wording
    // written to the wrong rulebook, which is exactly what that report exists
    // to surface.
    eea: {
      authored: "2026-08-18",
      text: "Yes, text me about Zuca. I'm agreeing to texts about the launch date and my first-access window — a handful around launch, not a stream. Zuca won't text me without this, my number isn't shared with anyone, and I can withdraw it any time by replying STOP.",
    },
  },

  // Postal. Framed as what it actually is, because the honest version is also
  // the appealing one — nobody minds a handwritten note, and pretending it is
  // something else would be the only way to make this creepy.
  mail: {
    authored: "2026-08-17",
    text: "You can post me something. We send handwritten notes to early supporters — that's what this is for, it's not shared with anyone, and you can ask us to delete it whenever you like.",
  },
};

// ─── Step 1 ──────────────────────────────────────────────────────────────────
export const step1 = {
  label: "Email address",
  placeholder: "you@example.com",
  cta: ACTIVE_CTA.step1,
  ctaBusy: ACTIVE_CTA.step1Busy,
  // Wording, privacy label and href are resolved per region at render time —
  // see src/components/waitlist/consent.js. Nothing reads them from here.
  errors: {
    empty: "Enter your email and we'll save your spot.",
    invalid: "That email doesn't look right — mind checking it?",
    consent: "Tick the box so we're allowed to email you.",
    rate_limited: "That's a lot of tries. Give it a minute and we'll take it from there.",
    // ⚠️ ONLY `offline` may say the address is saved. It is the only failure
    // we actually queue. `server` covers a 404, a 5xx, a timeout and an
    // unreachable endpoint — none of which stored anything, so none of which
    // may imply otherwise. A false reassurance is worse than a blunt error:
    // it makes people stop trying.
    server: "That's our end, not yours — your email hasn't saved yet. Give it another go?",
    offline: "You're offline. We've saved your email here and we'll send it the moment you're back.",
  },
};

// ─── Step 2 ──────────────────────────────────────────────────────────────────
export const step2 = {
  title: "You're in. Want first access and a say in what we make?",
  body: "Seven quick taps. It decides which flavor we produce first and what we charge — and it moves you up the list for the first run.",
  cta: "Save my answers",
  ctaBusy: "Saving…",
  skip: "Skip — just the email is fine",
  // The health-motivation opt-in is deliberately separate from the marketing
  // consent. It is never bundled and never pre-checked.
  motivationConsent: consentTexts.motivation.text,
  motivationHint: "Pick up to 3.",
  // The health question sits behind a disclosure so it costs nothing to anyone
  // who doesn't want it. The consent box stays INSIDE and ABOVE the chips —
  // consent before collection, never the reverse.
  motivationDisclosure: "Want to help shape what we make?",

  // ── Screens ────────────────────────────────────────────────────────────────
  // Grouped cards, not a wall. Each screen states what its answers DECIDE —
  // people finish a form when they can see the lever they are pulling, and
  // "which flavour we make first" is a lever in a way that "help us improve" is
  // not. Each screen saves on advance, so leaving at screen 3 keeps 1 and 2.
  screens: [
    {
      id: "product",
      title: "What would you actually eat?",
      why: "This decides which flavor we produce first, and how much of it.",
    },
    {
      id: "value",
      title: "What's it worth to you?",
      why: "You're setting the launch price. We haven't fixed it yet.",
    },
    {
      id: "reach",
      title: "Where would you find it?",
      why: "This decides whether we chase shelves or sell direct.",
    },
    {
      id: "extras",
      title: "A few optional extras",
      why: "All opt-in, all skippable. Nothing here is needed to hold your spot.",
    },
  ],
  next: "Continue",
  nextBusy: "Saving…",
  back: "Back",
  finish: "Done",
  savedNote: "Saved as you go — you can stop anywhere.",

  officeName: "Company",
  smsDisclosure: "Want launch texts too?",
  mailDisclosure: "We send handwritten notes. Want one?",
  mailGate: "Answer anything above first and this opens up.",
};

// ─── Confirmation ────────────────────────────────────────────────────────────
export const confirmation = {
  title: "You're #{position} on the list.",
  titleFallback: "You're on the list.",
  duplicate: "You're already on the list — nice.",
  duplicateBody: "Nothing to do. You'll get the ship date with everyone else who got in early.",
  whatNext: [
    { when: "Right now", what: "Your spot is saved. No card, no charge, nothing to confirm." },
    { when: "Before launch", what: "One email with the ship date and your ordering window, ahead of the public." },
    { when: "Launch week", what: "Waitlist members order first, at launch pricing, while the first run lasts." },
  ],
  shareTitle: "Know someone who'd want a bite?",
  shareBody: "Every person you send moves the first production run closer to actually happening.",
  shareCta: "Share Zuca",
  shareCopied: "Link copied.",
  shareText: "Zuca: 10g of fiber, 150 calories, made from apple pulp headed for the landfill. Built by a Michelin-trained chef and a Stanford physician.",
};
