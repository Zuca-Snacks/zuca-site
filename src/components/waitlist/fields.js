// ─── Step 2 field definitions ────────────────────────────────────────────────
// Every `value` below is an enum from the frozen waitlist contract in
// AGENTS_BRIEF.md. Labels are ours; values are not — do not edit a value
// without editing the contract.
//
// Each field is here because it answers a decision Zuca has to make. If a
// field stops answering a decision, delete it: every extra tap costs signups.

/**
 * Art 9 minimisation: the dietary box is capped far shorter than the others.
 * "sesame" and "low FODMAP" fit; a medical history does not. Distinct constant
 * on purpose — referral_source_other and channel_other stay at 120, and
 * lowering the shared value would quietly truncate both.
 * 60 matches security's cap exactly, so nothing the server would accept is
 * silently cut short here.
 */
export const DIETARY_OTHER_MAX = 60;

/**
 * First name. The FIRST question on screen 1, before flavour — it is the
 * lowest-effort question in the flow, and opening with an easy one lifts
 * completion on everything after it.
 *
 * ⚠️ TWO CONDITIONS FROM SECURITY, BOTH LOAD-BEARING:
 *
 *  1. GENUINELY OPTIONAL. Not required, no soft-required styling, nothing
 *     blocking Continue. The privacy policy promises "only your email address
 *     and your consent are required" and that promise has to stay true.
 *
 *  2. LABELLED "FIRST NAME", never "Name" or "Full name". The policy says
 *     first name and the 40 cap is set on that basis. "Full name" would make
 *     the policy inaccurate AND invite surnames the cap then rejects — a
 *     rejection nobody can understand, on a field they were told was optional.
 *
 * No separate consent: GDPR needs consent per PURPOSE, not per field, and a
 * name used to address the launch email is inside the purpose the marketing
 * wording already names. Security's call, on the record.
 */
export const NAME = {
  key: "name",
  label: "First name",
  placeholder: "Sarah",
  maxLength: 40,
  why: "Lets the launch email address a person.",
};

/** Which flavor to produce first. Lowest-friction question, so it opens step 2. */
export const FLAVOR = {
  key: "flavor",
  label: "Which one sounds more appetizing?",
  why: "Decides the production mix of the first run.",
  options: [
    { value: "choc_rasp_salt", label: "Chocolate Raspberry Sea Salt" },
    { value: "maple_pecan", label: "Maple Pecan" },
    { value: "both", label: "Both, honestly" },
    { value: "undecided", label: "No idea yet" },
  ],
};

/** How hard to chase them at launch, and how much to make. */
export const INTENT = {
  key: "intent",
  label: "How ready are you?",
  why: "Tells us how big the first run needs to be and who to contact first.",
  options: [
    { value: "preorder_now", label: "I'd order today" },
    { value: "very_interested", label: "Very interested" },
    { value: "curious", label: "Curious" },
    { value: "just_browsing", label: "Just looking" },
  ],
};

/** The 12-pack price. Direct pricing input. */
export const PRICE_BAND = {
  key: "price_band",
  // The unit is stated on the screen itself — a 12-pack is 12 servings, 60
  // bites — because nobody can price a quantity they are guessing at. No
  // per-serving figure anywhere: that would be an anchor, and prices were
  // removed from the site deliberately.
  label: "What feels fair for a 12-pack?",
  why: "Sets launch pricing.",
  options: [
    { value: "25_34", label: "$25–34" },
    { value: "35_44", label: "$35–44" },
    { value: "gt_45", label: "$45 or more" },
    { value: "other", label: "Something else" },
  ],
  // ⚠️ "Under $24" was dropped on instruction, which RAISES THE ANCHOR: someone
  // who would pay $20 now has to reach for Other. Watch how often
  // price_band_other comes in below the lowest band — if it is frequent, the
  // band set is wrong rather than the respondents. See HANDOFF-growth.md.
  otherKey: "price_band_other",
  // The unit is in the label and the placeholder because ui/OtherInput has no
  // prefix slot and inventing one is UX's call, not mine. Both say dollars, so
  // nobody types "30" meaning pounds or per-serving — the answer is stored
  // verbatim, so an ambiguous unit is unrecoverable later.
  otherLabel: "What would you pay, in dollars, for a 12-pack?",
  otherPlaceholder: "$28",
  // 40 — matching the server EXACTLY, which matters more than the number.
  // A client cap ABOVE the server's is not a laxer client, it is a 400 on the
  // whole submission for any answer between the two. 16 was too tight in the
  // other direction: "$25-30 depends on size" is 22 characters and is a real
  // answer, and rejecting it trades a signup for a tidier column.
  otherMax: 40,
};

/**
 * Health-adjacent personal data. Gated behind its own explicit opt-in, stored
 * only with that opt-in, and never sent to a third-party analytics tool — only
 * the selection count leaves the browser as telemetry.
 */
export const MOTIVATION = {
  key: "motivation",
  label: "What's drawing you to more fiber?",
  why: "Shapes what we say in the emails you'll actually get.",
  // No cap: if someone has four reasons, take four. See HANDOFF-growth.md on
  // watching the average selection count — unlimited picking weakens signal.
  // ⚠️ EVERY OPTION IS A FACT ABOUT THE PERSON, NEVER AN EFFECT OF THE PRODUCT.
  // A list WE wrote is read as a list of things Zuca does. "Manage glucose
  // spikes" in our own dropdown is us suggesting Zuca manages glucose spikes,
  // whoever ticks it. So the options describe the reader's situation and
  // motivation — "feeling full longer", not "satiety benefit"; "a doctor
  // suggested it", not "doctor-recommended". Phrase every future option that
  // way or it becomes a claim we did not intend to make.
  options: [
    { value: "digestion", label: "Digestion" },
    { value: "regularity", label: "Regularity" },
    { value: "gut_health", label: "Gut health" },
    { value: "energy", label: "Steady energy" },
    { value: "fullness", label: "Feeling full longer" },
    { value: "whole_foods", label: "Eating more whole foods" },
    { value: "family_health", label: "Feeding my family better" },
    { value: "doctor_suggested", label: "A doctor suggested it" },
    { value: "sustainability", label: "Less food waste" },
    // ⚠️ A FACT ABOUT THE PERSON. Never "GLP-1 support", never a benefit.
    // The guardrails still forbid GLP-1 and weight-loss claims — collecting
    // this is not permission to market on it, and the segment must never
    // become copy. It is accepted by the server ONLY when the health consent
    // wording names medication; see consentTexts.motivation in copy.js.
    { value: "glp1_medication", label: "I'm on a GLP-1 medication" },
    { value: "other", label: "Something else" },
    // ── THE MEDICATION DECISION, KEPT BECAUSE IT IS REVERSIBLE ───────────────────────────────────
    // Declined once, then approved by Emil on 19 Aug under the standing
    // instruction to treat Cooley items as signed off. The objection is kept
    // rather than deleted, because the decision is meant to stay reversible:
    // medication reveals treatment and therefore, by inference, diagnosis —
    // the hard end of Art 9 — and the brief forbids GLP-1 and weight-loss
    // claims, so it is data we may hold and may not market on. If that trade
    // ever stops being worth it, removing the chip is client-first and the
    // server's gate closes behind it.
  ],
  // ── FREE TEXT: REMOVED 18 AUG, RESTORED 19 AUG ─────────────────────────────
  // Precision about which of those two happened matters. The Art 9 argument for
  // removing it was never refuted — a box beside a health question invites
  // disclosure a chip cannot — the constraint it was weighed against moved when
  // Emil lifted the hold. "We decided differently" and "we were wrong" leave
  // very different guidance behind.
  //
  // ⚠️ THE PLACEHOLDER IS THE ONLY CONTROL, AND IT IS OURS.
  // The server gates `glp1_medication` on consent wording that names
  // medication. It CANNOT gate free text: nothing can see what a person is
  // about to volunteer. So "because of my metformin" arrives whatever wording
  // they were shown, and no schema change prevents it.
  //
  // What is left is register, and copy sets register better than instructions
  // do. Hence a bounded ask ("in a few words") over an open one ("tell us
  // more"), an explicit no-medical-details, and a placeholder that MODELS a
  // short non-clinical answer — an example teaches the shape of a reply faster
  // than a rule forbids the wrong one. Treat this wording as load-bearing.
  otherKey: "motivation_other",
  otherLabel: "In a few words — no medical details, please",
  otherPlaceholder: "More fiber, mostly",
  // 60, matching dietary_other and the server. For a health free-text field the
  // cap IS the minimisation, so it is set here rather than falling through to
  // OTHER_MAX (120) — and a client cap above the server's is a 400 for
  // everything in the gap.
  otherMax: 60,
};

/** Where demand clusters — shipping zones, and which cities to seed retail in. */
export const ZIP = {
  key: "zip",
  label: "ZIP code",
  // The contract fixes this to /^[0-9]{5}$/ — a US postcode, while the outreach
  // list spans four continents. The field is therefore hidden outright for
  // visitors we can place outside the US (see region.js). The hint below is the
  // fallback for the ambiguous case, where we show the field but say plainly
  // that it does not apply to everyone. Flagged for the contract in
  // HANDOFF-growth.md.
  hint: "US only — skip this if you're somewhere else.",
  why: "Shows us where demand clusters, for shipping and early retail.",
  placeholder: "94305",
};

/** Attribution for channels UTMs can't see — a doctor's office, an event, word of mouth. */
export const REFERRAL_SOURCE = {
  key: "referral_source",
  label: "How did you find us?",
  why: "Catches the offline channels UTMs miss.",
  options: [
    { value: "email", label: "An email" },
    // Label keeps the historical word "physician" so the column reads
    // continuously against the legacy "How They Heard" values. See LEGACY_MAP.
    { value: "doctor", label: "A physician" },
    { value: "friend", label: "Friend or family" },
    { value: "instagram", label: "Instagram" },
    { value: "tiktok", label: "TikTok" },
    { value: "event", label: "An event" },
    { value: "search", label: "Search" },
    { value: "other", label: "Somewhere else" },
  ],
  otherKey: "referral_source_other",
  otherLabel: "Where did you hear about us?",
};

/**
 * Identifies the clinician cohort. This is the highest-value segment Zuca has
 * — the symposium list — and it needs completely different email from a
 * consumer. Asked as a plain factual question about the person; it is not, and
 * must not become, a recommendation or endorsement claim.
 */
export const IS_CLINICIAN = {
  key: "is_clinician",
  label: "Are you a clinician or dietitian?",
  why: "That cohort gets different email from everyone else.",
  options: [
    { value: true, label: "Yes" },
    { value: false, label: "No" },
  ],
};


// ─── Added 17 Aug 2026 ───────────────────────────────────────────────────────
// Every field below is optional and lives in step 2 or later, after the email
// is already banked. Step 1 is email + consent and nothing else — these trade
// data completeness against nothing, never against a signup.

/** How much they would actually eat. Sizes the first run in units, not vibes. */
export const QUANTITY_BAND = {
  key: "quantity_band",
  // In SERVINGS, not bites. "How many would you eat a month" was being read
  // both ways, so the unit is now stated on the screen itself rather than
  // assumed — a band means nothing if two people read it differently.
  label: "Realistically, how many servings a month?",
  hint: "One serving is 5 bites.",
  why: "Turns a headcount into a production quantity.",
  options: [
    { value: "srv_1_2", label: "1–2 servings" },
    { value: "srv_3_5", label: "3–5" },
    { value: "srv_6_10", label: "6–10" },
    { value: "srv_11_20", label: "11–20" },
    { value: "srv_gt_20", label: "More than 20" },
  ],
  // ⚠️ SERIES BREAK. The legacy values (lt_4, 4_8, 9_16, 17_30, gt_30) counted
  // BITES — five times smaller. The srv_ prefix exists so a query pooling both
  // generations is obviously wrong rather than quietly wrong: unprefixed,
  // `9_16` and `6_10` overlap as ranges while meaning quantities five times
  // apart, and nothing in either value says which unit it is. Do not average
  // across the two.
};

/**
 * Where they would expect to find it.
 *
 * EARNS ITS PLACE: this is the single cheapest input to the distribution
 * decision. A list that says "grocery" and a list that says "online" lead to
 * different companies — one chases retail buyers, the other chases ads. One
 * chip row answers it before a single dollar is committed either way.
 */
export const CHANNEL = {
  key: "channel",
  label: "Where would you expect to buy it?",
  why: "Decides whether we chase retail or sell direct first.",
  options: [
    { value: "online_dtc", label: "Online, from you" },
    { value: "grocery", label: "Grocery store" },
    { value: "gym_studio", label: "Gym or studio" },
    { value: "office", label: "At work" },
    { value: "clinic", label: "A clinic or pharmacy" },
    { value: "other", label: "Somewhere else" },
  ],
  otherKey: "channel_other",
  otherLabel: "Where?",
};

/**
 * Dietary needs.
 *
 * EARNS ITS PLACE, and it is the highest-value field added today. Both flavors
 * contain tree nuts. Someone with a nut allergy can never buy this, no matter
 * how well the campaign converts them — so this is the difference between list
 * size and *addressable* list size, which is the number that actually forecasts
 * revenue. It also answers whether a nut-free SKU is worth a production line,
 * and it stops us emailing a launch offer to someone who would have to decline
 * it, which costs trust we cannot buy back.
 *
 * ⚠️ ART 9. An allergy is health data under GDPR, exactly like `motivation`.
 * It is gated by the SAME single explicit health opt-in, whose wording names
 * both. One consent covering both is correct; two would be friction without
 * added protection, and collecting either without one is unlawful.
 *
 * No condition names beyond the allergy itself — no "diabetic", no "IBS". The
 * claim guardrails apply to the options we offer, not only to our own copy.
 */
export const DIETARY = {
  key: "dietary",
  label: "Anything we should know before we make yours?",
  why: "Tells us the addressable share of the list, and whether a nut-free run is worth it.",
  options: [
    { value: "none", label: "Nothing to flag" },
    { value: "nut_allergy", label: "Tree nut allergy" },
    // ⚠️ This is the USER telling us their diet, never a claim about Zuca.
    // We must NEVER state the product is gluten-free: it is unconfirmed, and
    // it is a separate question from what is in the recipe — a gluten-free
    // recipe made on a shared line is not a gluten-free product. Reading this
    // chip as product evidence is the mistake to avoid.
    { value: "gluten_free", label: "Gluten free" },
    { value: "dairy_free", label: "Dairy free" },
    { value: "vegan", label: "Vegan" },
    { value: "low_sugar", label: "Watching sugar" },
    { value: "other", label: "Something else" },
  ],
  // Free text stays here, because an unlisted allergen has no chip and the
  // whole point of the field is catching the one we did not think of. It is
  // capped much shorter than the others and the label asks for a NAME, not a
  // history — the cap is the enforcement, the wording is the invitation.
  otherKey: "dietary_other",
  otherLabel: "Which allergen? Just the name — no medical details.",
  otherMax: DIETARY_OTHER_MAX,
};

/** Office channel. A yes here is worth many consumer signups. */
export const OFFICE_INTEREST = {
  key: "office_interest",
  label: "Would you want these as an office snack?",
  why: "One office order is worth dozens of individual ones.",
  options: [
    { value: "yes", label: "Yes" },
    { value: "maybe", label: "Maybe" },
    { value: "no", label: "No" },
  ],
};

export const COMPANY_HEADCOUNT = {
  key: "headcount",
  label: "Roughly how many people?",
  why: "Sizes the office opportunity.",
  options: [
    { value: "lt_10", label: "Under 10" },
    { value: "10_49", label: "10–49" },
    { value: "50_199", label: "50–199" },
    { value: "200_999", label: "200–999" },
    { value: "gt_1000", label: "1,000+" },
  ],
};

export const COMPANY_NAME = {
  key: "company",
  label: "Company",
  placeholder: "Where do you work?",
  maxLength: 80,
};

/**
 * EARNS ITS PLACE: the scarcest asset a pre-launch brand has is people who will
 * talk to it. This converts a passive list into a research panel at the cost of
 * one chip, and it identifies the people worth asking for a referral later.
 * A preference about email we are already permitted to send, so it needs no
 * separate consent — it narrows contact rather than widening it.
 */
export const RESEARCH_OPTIN = {
  key: "research_optin",
  label: "Open to 15 minutes of feedback before we launch?",
  why: "Turns the list into a research panel.",
  options: [
    { value: true, label: "Happy to" },
    { value: false, label: "No thanks" },
  ],
};

/** SMS. Gated by its own TCPA-grade express consent — see consent.js. */
export const PHONE = {
  key: "phone",
  label: "Mobile number",
  placeholder: "+1 555 000 0000",
  maxLength: 24,
};

/**
 * Postal address, for the handwritten notes. Gated by its own opt-in AND only
 * offered after they have answered something else — asking a stranger for their
 * address as the opening move is how you lose the stranger.
 *
 * Deliberately international-shaped: free-form lines, no US postcode regex.
 * `zip` stays the US-only structured field; this is the one that has to work in
 * Oslo and Tokyo.
 */
export const ADDRESS = {
  key: "address",
  fields: [
    { key: "address_line1", label: "Street address", autoComplete: "address-line1", maxLength: 120 },
    { key: "address_line2", label: "Apartment, floor (optional)", autoComplete: "address-line2", maxLength: 120 },
    { key: "address_city", label: "City", autoComplete: "address-level2", maxLength: 80 },
    { key: "address_region", label: "State or region", autoComplete: "address-level1", maxLength: 80 },
    { key: "address_postal_code", label: "Postal code", autoComplete: "postal-code", maxLength: 16 },
    // Rendered as a select, not a text input — the server needs ISO alpha-2.
    { key: "address_country", label: "Country", autoComplete: "country", select: true },
  ],
};

/** Default cap for a `*_other` box. Matches the server's safeString(120). */
export const OTHER_MAX = 120;

/** Per-field override, where a shorter cap is itself a data-minimisation control. */
export const otherMaxFor = (def) => def.otherMax ?? OTHER_MAX;

export const STEP2_FIELDS = [FLAVOR, INTENT, PRICE_BAND, MOTIVATION, ZIP, REFERRAL_SOURCE, IS_CLINICIAN];

// ─── Reconciliation with the historical sheet ────────────────────────────────
// The live Google Sheet already holds rows written by the old pre-order modal,
// under two columns with their own value sets:
//
//   Reason:         fiber, gut, sustainability, weight, other
//   How They Heard: friend, stanford, social, physician, other
//
// The contract enums in AGENTS_BRIEF.md are frozen, so the reconciliation
// happens here rather than by changing either side. Apply LEGACY_MAP to old
// rows to bring both eras into one analyzable column.
//
// Anything mapping to null has NO 1:1 successor — see DISCONTINUITIES. Those
// cases must be handled explicitly, not silently bucketed into `other`, or a
// period-over-period comparison will quietly lie.

export const LEGACY_MAP = {
  // "Reason" → motivation
  motivation: {
    gut: "gut_health",
    sustainability: "sustainability", // unchanged
    other: "other", // unchanged
    fiber: null, // no successor — see DISCONTINUITIES.fiber
    weight: null, // retired — see DISCONTINUITIES.weight
  },
  // "How They Heard" → referral_source
  referral_source: {
    friend: "friend",
    physician: "doctor", // same concept, contract spells it `doctor`
    other: "other", // unchanged
    social: null, // now split — see DISCONTINUITIES.social
    stanford: null, // no successor — see DISCONTINUITIES.stanford
  },
};

export const DISCONTINUITIES = {
  fiber:
    'Legacy "fiber" was the general "I want more fiber" reason. The new options ' +
    "split that intent across digestion, regularity, gut_health, energy and " +
    "family_health. Do not fold it into `other` — when comparing periods, treat " +
    "legacy (fiber + gut) as the union of those five new values.",
  weight:
    'Legacy "weight" is retired and is NOT offered as a new option: weight-loss ' +
    "framing is forbidden by the claim guardrails in AGENTS_BRIEF.md. Historical " +
    "rows keep the value — do not rewrite or delete them — but the series ends at " +
    "the cutover and no new rows will carry it.",
  social:
    'Legacy "social" is one bucket; new rows split it into `instagram` and ' +
    "`tiktok`. Legacy rows cannot be attributed to a platform after the fact, so " +
    "platform-level series start at the cutover. For a continuous series, sum " +
    "instagram + tiktok and compare that against legacy social.",
  stanford:
    'Legacy "stanford" (the Stanford community) has no successor — the contract ' +
    "enum has no equivalent and adding one would break the frozen contract. New " +
    "rows from that channel land in `event` or `other`, so the legacy value is a " +
    "closed series. UTMs are the better instrument for it going forward.",
};
