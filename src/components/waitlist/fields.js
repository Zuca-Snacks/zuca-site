// ─── Step 2 field definitions ────────────────────────────────────────────────
// Every `value` below is an enum from the frozen waitlist contract in
// AGENTS_BRIEF.md. Labels are ours; values are not — do not edit a value
// without editing the contract.
//
// Each field is here because it answers a decision Zuca has to make. If a
// field stops answering a decision, delete it: every extra tap costs signups.

/** Which flavor to produce first. Lowest-friction question, so it opens step 2. */
export const FLAVOR = {
  key: "flavor",
  label: "Which one would you reach for?",
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
  label: "What feels fair for a 12-pack?",
  why: "Sets launch pricing.",
  options: [
    { value: "lt_24", label: "Under $24" },
    { value: "24_29", label: "$24–29" },
    { value: "30_35", label: "$30–35" },
    { value: "36_42", label: "$36–42" },
    { value: "gt_42", label: "Over $42" },
  ],
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
  max: 3,
  options: [
    { value: "digestion", label: "Digestion" },
    { value: "regularity", label: "Regularity" },
    { value: "gut_health", label: "Gut health" },
    { value: "energy", label: "Steady energy" },
    { value: "sustainability", label: "Less food waste" },
    { value: "doctor_suggested", label: "A doctor suggested it" },
    { value: "family_health", label: "Feeding my family better" },
    { value: "other", label: "Something else" },
  ],
};

/** Where demand clusters — shipping zones, and which cities to seed retail in. */
export const ZIP = {
  key: "zip",
  label: "ZIP code",
  // The contract fixes this to /^[0-9]{5}$/ — a US postcode. The outreach list
  // spans four continents, so the hint says so plainly rather than letting a
  // London or Tokyo signup fail a field they cannot pass. Flagged for the
  // contract in HANDOFF-growth.md.
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
