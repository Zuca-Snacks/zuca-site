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
// ── TODO (BLOCKING before the outbound campaign sends) ───────────────────────
// ALLERGEN PANEL IS INCOMPLETE ON PURPOSE.
// Confirmed and safe to publish: both flavors contain TREE NUTS — almonds and
// pecans. Nothing else is confirmed.
// NOT yet confirmed, and therefore NOT stated anywhere on the site:
//   • gluten / oats status
//   • dairy in the Chocolate Raspberry Sea Salt
//   • shared-facility cross-contact with other allergens
// Emil is obtaining written confirmation from Step Change Innovations. Do not
// add any of the above to this file — or soften the "we're not publishing a
// guess" line in the allergen FAQ — until that confirmation exists in writing.
//
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
export const HEADLINES = {
  // A — specificity first. Two evaluable numbers, then the one strange fact.
  a: {
    id: "a",
    headline: "10g of fiber. 150 calories. Made from apple pulp that was headed for the landfill.",
    subhead:
      "Zuca is a snack bite from a Michelin-trained chef and a Stanford physician. Two flavors, no added sugar, and 130+ people already in line.",
  },
  // B — origin story first. Best story, but asks the reader to care about
  // juiceries before they care about the snack.
  b: {
    id: "b",
    headline: "Juiceries throw the fiber away. We rescued it and turned it into dessert.",
    subhead:
      "10g of fiber, 150 calories, no added sugar. Chocolate Raspberry Sea Salt or Maple Pecan, built by a Michelin-trained chef and a Stanford physician.",
  },
  // C — category stat first. Highest-context, but opens on the reader's deficit
  // rather than on the product.
  c: {
    id: "c",
    headline: "95% of Americans don't get enough fiber. This is 10 grams of it, and it tastes like dessert.",
    subhead:
      "150 calories. No added sugar. Made from apple pulp a juicery was about to throw away, by a Michelin-trained chef and a Stanford physician.",
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
};

// ─── Proof strip ─────────────────────────────────────────────────────────────
// Specificity is the trust mechanism. Every line is a verifiable event.
export const proof = [
  { value: "130+", label: "pre-orders before launch" },
  { value: "45 min", label: "to run out at Stanford Demo Day" },
  { value: "Day 1", label: "sold out at a physician symposium" },
];

// ─── Three-number block ──────────────────────────────────────────────────────
export const numbers = {
  title: "What's actually in one.",
  items: [
    { value: "10g", unit: "fiber", note: "About 40% of your daily fiber, and twice what the leading bars carry." },
    { value: "150", unit: "calories", note: "Plus 4g of protein and 6g of natural sugar." },
    { value: "0g", unit: "added sugar", note: "The sweetness is the fruit. Nothing is added to it." },
  ],
  footnote: "Per serving. Contains tree nuts — almonds and pecans.",
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
};

// ─── Intro gate (organic visitors only) ──────────────────────────────────────
export const introLines = [
  "A Michelin-trained chef and a Stanford physician,",
  "turning what juiceries throw away",
  "into 10 grams of fiber.",
];

// ─── Founder credentials ─────────────────────────────────────────────────────
export const founders = [
  {
    name: "Emil Nordin",
    role: "Chef & Co-Founder",
    creds: [
      "Norway's Most Promising Young Chef, 2021",
      "Michelin-trained at Restaurant Kontrast (2 stars + Green Star)",
      "National TV host, 1M+ viewers",
      "Stanford Bioengineering & Biodesign '26",
    ],
  },
  {
    name: "Kelley Yuan, MD",
    role: "Physician & Co-Founder",
    creds: [
      "Stanford Medicine physician",
      "Stanford Sustainability Fellow",
      "Leads Zuca's clinical network: 10+ physicians across 7 specialties",
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
    a: "Both flavors contain tree nuts — almonds and pecans. If you have a tree nut allergy, this is not a product for you, and we'd rather say so now than sell you one bite. Per serving: 10g fiber, 150 calories, 4g protein, 6g natural sugar, no added sugar. The full ingredient and allergen panel — including gluten, dairy, and whether it shares a facility with other allergens — goes up the moment our manufacturer confirms it in writing. We're not publishing a guess.",
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
    a: "Emil Nordin, a Michelin-trained chef and Stanford bioengineering student, and Kelley Yuan, MD, a Stanford Medicine physician. Zuca is supported by Stanford's NEXT Accelerator, advised pro bono on FDA regulatory matters by Cooley LLP, and manufactured by Step Change Innovations.",
  },
];

// ─── Step 1 ──────────────────────────────────────────────────────────────────
export const step1 = {
  label: "Email address",
  placeholder: "you@example.com",
  cta: ACTIVE_CTA.step1,
  ctaBusy: ACTIVE_CTA.step1Busy,
  consent:
    "Email me about Zuca — launch date, first access, and the occasional note from the kitchen. I can unsubscribe from any email.",
  privacyLabel: "Privacy",
  privacyHref: "/privacy",
  errors: {
    empty: "Enter your email and we'll save your spot.",
    invalid: "That email doesn't look right — mind checking it?",
    consent: "Tick the box so we're allowed to email you.",
    rate_limited: "That's a lot of tries. Give it a minute and we'll take it from there.",
    server: "Our end broke, not yours. We've kept your email — try that button once more.",
    network: "You look offline. We've saved your email and we'll send it the moment you're back.",
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
  motivationConsent:
    "I'm happy to tell Zuca why fiber matters to me. Stored with my signup, never sold, and never sent to an ad or analytics tool.",
  motivationHint: "Pick up to 3.",
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
