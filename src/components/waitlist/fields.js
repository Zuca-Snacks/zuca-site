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
    { value: "doctor", label: "A doctor or dietitian" },
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
