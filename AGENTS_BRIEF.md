# ZUCA WEBSITE — SHARED BRIEF (paste into all three agents)

> This block is identical in all three agent prompts. It is the contract that lets three
> agents work on the same repo at the same time without blocking or colliding.

## The product (verified facts — do not invent others)

- Zuca upcycles apple pulp — a waste byproduct juiceries pay to dispose of ($25/ton) — into fiber-rich snack bites.
- **Per serving: 10g fiber, 150 kcal, 4g protein.** ~40–45% of daily recommended fiber. 2x the fiber of leading competitors.
- ⚠️ **Sugar: there IS added sugar, and none of it is refined.** Those are two different statements and only the second is a selling point. Maple syrup is a sweetener and it is added — under FDA labelling rules syrups and honey count as *added sugars* — so the previous "6g natural sugar, no added sugar" was wrong on both halves. **Do not state a sugar number anywhere** until the finished label confirms it. "No refined sugar" is accurate and permitted; "no added sugar" is not, and the two are one word apart, which is exactly why this is written down.
- ⚠️ **Allergens: tree nuts — almonds and pecans**, in both flavours. The nut base **may change to sunflower butter**, which would change that list, so every allergen statement must be framed as the current formulation and must point at the package panel as the authority. **Never claim "gluten-free"** — it is a regulated claim with a testing standard behind it, we have not tested against it, and the facility's other lines are unconfirmed.
- Two flavors: **Chocolate Raspberry Sea Salt** and **Maple Pecan**.
- Traction: **130+ waitlist signups** (~127 after removing test rows). **No payment has been taken — do not describe these as pre-orders anywhere.** They are people who gave an email address to be told when the product is available; no money changed hands, no order exists, no contract of sale was formed. Calling them pre-orders overstates traction to investors and misdescribes the transaction to consumers. "Waitlist signups", "people on the list", "signups" are all fine. Samples ran out on Day 1 at the Vituity Health symposium (physician network: 6,000+ docs, 10M+ patients/yr). Ran out in 45 minutes at Stanford Founder's Demo Day (300+ investors, 1,500+ attendees).
- Founders: **Emil Nordin** — Norway's Most Promising Young Chef 2021, trained at Kontrast (2 Michelin stars + Green Star), Stanford Bioengineering '26. **Kelley Yuan, MD** — Stanford Medicine physician, leads Zuca's clinical network (10+ physicians across 7 specialties).
- Supported by Stanford's NEXT Accelerator / Emergence program. Pro bono FDA regulatory counsel from Cooley LLP. Manufacturing via Step Change Innovations in 21 CFR 117-compliant facilities.
- Context: 95% of American adults and kids are fiber deficient. Rotting food waste = 8% of US greenhouse gas emissions.
- Target D2C price: $2.99/unit.

## Health-claim guardrails (NON-NEGOTIABLE — this is a food product under FDA scrutiny)

Zuca is a food, not a drug. Nothing on the site may state or imply that it treats, prevents, cures, or mitigates a disease.

**Allowed** (structure/function + factual nutrient content):
- "10g of fiber per serving — about 40% of your daily fiber."
- "Fiber supports digestive health." / "Supports regularity." / "Good source of dietary fiber."
- "95% of Americans don't get enough fiber." (cited statistic about the population, not a product claim)
- "Created by a Michelin-trained chef and a Stanford physician."
- "Built with input from 10+ physicians across 7 specialties."

**Forbidden:**
- **"No added sugar", "no sugar added", "only natural sugar", "naturally sweetened", or any sugar figure at all** until the finished label is confirmed. There IS added sugar; maple syrup is one under FDA rules. **"No refined sugar" is the accurate version and is allowed.** This is a *labelling* claim, not a health claim, and it is the kind that draws a warning letter or a class action rather than a polite correction — the number is checkable against the panel.
- **"Gluten-free", "no gluten", or any equivalent.** A regulated claim (FDA: under 20 ppm, with testing behind it). Untested here, and the facility's other lines are unconfirmed. Note `gluten_free` exists as a *dietary preference a user can select* — that records what they need, and must never be answered with a claim that we meet it.
- **Any allergen statement that reads as final.** Almonds and pecans today; the base may move to sunflower butter. Always frame as current formulation and point at the package panel.
- Any mention of Zuca and a named disease in the same claim: diabetes, colon cancer, IBS, diverticulitis, constipation-as-condition, heart disease, obesity.
- "Physician-recommended," "doctor-approved," "clinically proven," "reduces your risk of," "prevents," "treats."
- Weight-loss or GLP-1 claims.
- Implying FDA endorsement because Cooley/ex-FDA attorneys advise the company.

If you believe a line is borderline, write it in the safe form and note it in your handoff file. Do not ship the risky version.

## Design tokens contract (UI/UX agent owns the values; everyone codes against these names)

All agents reference these CSS custom properties. They exist in `src/styles/tokens.css` from the first commit of the UI/UX branch. Never hardcode a hex value or a px font size anywhere else.

```
--z-bg  --z-surface  --z-surface-alt  --z-ink  --z-ink-muted  --z-border
--z-brand  --z-brand-dark  --z-accent  --z-accent-ink  --z-warm
--z-success  --z-danger  --z-focus
--z-step--1 --z-step-0 --z-step-1 --z-step-2 --z-step-3 --z-step-4   (fluid type scale)
--z-space-1 … --z-space-8   --z-radius-sm --z-radius-md --z-radius-full
--z-shadow-sm --z-shadow-md   --z-ease --z-dur
```

Starting values (UI/UX agent may refine against the real packaging/logo, but must keep the names and keep AA contrast):

```css
--z-bg:#FBF6EE; --z-surface:#FFFFFF; --z-surface-alt:#F3EADA;
--z-ink:#1E1A17; --z-ink-muted:#5B5148; --z-border:#E7DCCB;
--z-brand:#1F6B4A; --z-brand-dark:#14472F;
--z-accent:#C2314B; --z-accent-ink:#FFFFFF;   /* primary CTA */
--z-warm:#E08A3C; --z-success:#2E7D5B; --z-danger:#B3261E; --z-focus:#1F6B4A;
```

Type: display face **Fraunces** (variable, warm serif — reads "chef-made"), body/UI face **Inter**. Self-hosted `.woff2`, latin subset, `font-display:swap`, preloaded. No Google Fonts CDN request (privacy + LCP).

## Waitlist data contract (frozen — all three agents code against exactly this)

`POST /api/waitlist` · `Content-Type: application/json`

> **Amended 2026-08-18 by the Security agent** (supersedes the 2026-08-16 amendment). Still frozen —
> code against exactly this. **Additive only: no existing field changed shape or meaning, and every
> new sheet column is appended, so the 137 rows already collected keep theirs.**
>
>
> **Field names and enum values are the Conversion agent's, verified against their shipped
> `api.js`/`fields.js` rather than against any description.** Where the two disagreed, security moved:
> their names were already live in a four-screen UI, and a contract nobody can implement is not a
> contract. Renamed here from an earlier draft: `company` → `company`, `headcount` →
> `headcount`, `consent_postal` → `consent_postal`, `address_postal_code` → `address_postal_code`,
> `postal_consent_text_version` → `postal_consent_text_version`.

### Client sends

```jsonc
{
  "email":            "string, required, RFC-lite validated, lowercased, trimmed, <=254 chars",
  "consent_marketing":"boolean, required, must be literally true (not \"true\", not 1)",

  "consent_health":   "boolean, default false — REQUIRED to store `motivation`, see below",
  "consent_sms":      "boolean, default false — REQUIRED to store `phone`",
  "consent_postal":     "boolean, default false — REQUIRED to store the address block",

  "zip":              "string|null, /^[0-9]{5}$/  — US ONLY, see the scope note below",
  "motivation":       "array<enum>|null, NO product cap — pick as many as apply. One of: digestion, regularity,\n  //                     gut_health, energy, sustainability, doctor_suggested, family_health,\n  //                     fullness, whole_foods, glp1_medication, other.\n  //                     glp1_medication is accepted ONLY with a health consent whose WORDING\n  //                     names medication — see below.",
  "intent":           "enum|null: preorder_now | very_interested | curious | just_browsing",
  "price_band":       "enum|null: 25_34 | 35_44 | gt_45 | other   // per 12-pack.\n  //                     Legacy lt_24 | 24_29 | 30_35 | 36_42 | gt_42 still accepted until the\n  //                     client stops sending them — REMOVE is client-first.",
  "price_band_other": "string|null, <=40 chars   // requires price_band === 'other'. Freehand,\n  //                     stored VERBATIM and never parsed: currency symbols and ranges expected.",
  "flavor":           "enum|null: choc_rasp_salt | maple_pecan | both | undecided",
  "is_clinician":     "boolean|null",
  "referral_source":  "enum|null: doctor, friend, instagram, tiktok, event, search, email, other",

  // ── Added 2026-08-17 ──────────────────────────────────────────────────────
  "quantity_band":    "enum|null: srv_1_2 | srv_3_5 | srv_6_10 | srv_11_20 | srv_gt_20   // SERVINGS per month.\n  //                     Legacy lt_4 | 4_8 | 9_16 | 17_30 | gt_30 count BITES and are still\n  //                     accepted — five times smaller, NOT the same series. See below.",

  // Office-snack path
  // TRI-STATE, not a boolean. "Maybe" is the most common honest answer to
  // "would you want these at work?" and is real signal for an office pilot.
  "office_interest":   "enum|null: yes | maybe | no",
  "company":      "string|null, <=80 chars",

  // ── Added 2026-08-19 ──────────────────────────────────────────────────────
  // Optional FIRST NAME. Maps onto the sheet's existing legacy `Name` column,
  // deliberately, so historical and new rows share one place.
  //
  // Cap 40 is agreed EQUAL on both sides, not independently chosen. First name
  // only — no surname is asked for, and the privacy policy already declares it
  // as "First name (optional)". No pairing rule and NO consent gate: it is
  // ordinary contact data covered by the marketing consent, and since
  // `consent_marketing` is mandatory a gate would never fire.
  "name":         "string|null, <=40 chars",

  // ── S22, added 2026-08-19 ─────────────────────────────────────────────────
  // The ONLY thing that permits a role address (office@, info@, team@, …).
  // Send BOTH or neither. The version must resolve to wording that NAMES the
  // business basis — the verbatim text is tested, not the boolean, exactly as
  // for glp1_medication.
  //
  // PRODUCTION ID: `biz-eea-2026-08-19-fc6ba471`, minted by Conversion's
  // fingerprint from their copy.js and resolved by the build-time generator.
  // `2026-08-19.business.a` is a PRE-MERGE FIXTURE ONLY, kept so the gate is
  // testable before copy.js exists here; the suite fails if it survives merge.
  //
  // ⚠️ A row with business_enquiry:true is STORED WITH consent_marketing FALSE
  // regardless of what the client sent, because we promised the person in
  // writing that a shared inbox would not join the personal mailing list. The
  // send list filters on consent_marketing = TRUE, so the promise holds
  // structurally rather than by anyone remembering an extra clause.
  //
  // Disposable domains stay rejected regardless. A throwaway domain is not a
  // workplace and the business basis does not make it one.
  "business_enquiry":              "boolean, default false",
  "business_consent_text_version": "string|null, <=64 chars",
  "headcount": "enum|null: lt_10 | 10_49 | 50_199 | 200_999 | gt_1000",

  "channel":       "array<enum>|null, no product cap: online_dtc | grocery | gym_studio | office | clinic | other",
  "channel_other": "string|null, <=120 chars   // requires channel to include 'other'",

  // Art 9 HEALTH DATA — an allergy is a health fact. Gated on consent_health,
  // whose wording names dietary needs explicitly. Dropped without it.
  "dietary":       "array<enum>|null, no product cap: none | nut_allergy | gluten_free | dairy_free | vegan | low_sugar | other",
  "dietary_other": "string|null, <=60 chars   // requires dietary to include 'other'. Shorter
  //                than the others on purpose: still Art 9, so bound how much can be typed.",

  // A preference about email we may already send, so it narrows contact rather
  // than widening it and needs no separate consent.
  "research_optin": "boolean|null",

  // Free-text escape for every enum offering "Other". Only two do.
  // Sending one WITHOUT the matching "other" selection is a 400.
  // Health free text — 60 chars, half what the non-health boxes get, and
  // dropped entirely without consent_health. Reinstated 19 Aug; see below.
  "motivation_other":       "string|null, <=60 chars   // requires motivation to include 'other'",
  "referral_source_other":  "string|null, <=120 chars   // requires referral_source === 'other'",

  // SMS. STRICT E.164 — unlike `zip`, this does not fail soft.
  "phone":                     "string|null, E.164 (+ then 8-15 digits); spaces/dashes/parens stripped",
  "sms_consent_text_version":  "string|null, <=64 chars, [A-Za-z0-9._-] only",

  // Postal address. Stored ONLY with consent_postal.
  // NOTE: address_postal_code is INTERNATIONAL and is not the same field as `zip`.
  "address_line1":       "string|null, <=120 chars",
  "address_line2":       "string|null, <=120 chars",
  "address_city":        "string|null, <=80 chars",
  "address_region":      "string|null, <=80 chars",
  "address_postal_code":      "string|null, <=16 chars, international format",
  "address_country":     "string|null, ISO 3166-1 alpha-2, user-supplied — NOT the server's `country`",
  "postal_consent_text_version": "string|null, <=64 chars, [A-Za-z0-9._-] only",

  // Set ONLY on a downgrade retry, naming the fields the client had to strip.
  // See "The downgrade path" below.
  "downgraded_fields": "array<string>|null, max 64"
  "utm":              "object|null: {source,medium,campaign,content,term} each <=64 chars",
  "page_path":        "string|null, <=200 chars",

  // Consent evidence. Identifies the exact wording rendered; only the client knows this.
  "consent_text_version":            "string|null, <=64 chars, [A-Za-z0-9._-] only",
  "motivation_consent_text_version": "string|null, same format — the Art 9 line, SEPARATE field",

  "hp_field":         "string|null   // honeypot, must be empty",
  "form_render_ts":   "number|null   // ms epoch when form mounted; <2s to submit = bot"
}
```

### Server sets — **rejected with a 400 if the client sends them**

```jsonc
{
  "consent_timestamp":     "ISO 8601, from the server clock",
  "country":               "ISO 3166-1 alpha-2, derived from request IP; 'XX' if unavailable",
  "consent_receipt":       "JSON string — self-contained consent record, see below",
  "needs_reconsent":       "boolean",
  "consent_regime_status": "enum: ok | mismatch | unverifiable",
  "reconsent_reason":      "string|null"
}
```

Consent evidence a submitter can supply is not evidence. The schema rejects unknown keys, so any
attempt to set these client-side fails the whole request rather than being quietly trusted.

**Response `200` now carries the post-write count:** `{"ok":true,"count":138}`. Additive — a client
ignoring the extra key behaves exactly as before. Use it to update the live counter rather than
issuing a follow-up `GET /api/count`, which an edge cache can answer with a number from *before*
this very write. If you genuinely need a separate read, `GET /api/count?fresh=1` bypasses the cache.

**Response contract — ALL NINE statuses.** Every body is exactly `{"ok":false,"error":"<slug>"}`
and carries **nothing else**. There is no field naming which input failed: the validator's
per-field `rule` goes to the server audit log only, and assuming otherwise is a mistake I made
in writing and Conversion caught by reading the code.

| Status | `error` | When | Client should |
|---|---|---|---|
| `200` | — | Accepted. Body is `{"ok":true,"count":N,"position":N}` | Success |
| `400` | `validation` | Any field failed any rule | Show a general message; **you cannot tell which field** |
| `403` | `forbidden` | `Origin` header present and not ours | Not reachable from our own pages |
| `405` | `method_not_allowed` | Not a POST | Bug if you see it |
| `409` | `duplicate` | Address already on the list | **Treat as success** |
| `413` | `payload_too_large` | Body over the cap | Do not retry unchanged |
| `415` | `unsupported_media_type` | Content-Type is not JSON | ⚠️ `navigator.sendBeacon` sends `text/plain` — an offline queue flushed with it gets 415, not 400, and the downgrade ladder will not save it |
| `429` | `rate_limited` | Rate limit hit | Back off; `Retry-After` is set |
| `500` | `server` | Our fault, including an unconfigured webhook | Retry later |

The four in the middle were previously undocumented. They are emitted by the running code, so
a client written against the old five-status list had no defined behaviour for a third of what
it can receive.

**Only `email` + `consent_marketing` are required.** Everything else is optional and collected
*after* the email is already captured. The email must be persisted even if the user abandons step 2.

### `consent_health` — load-bearing, and it was missing from this document

`motivation` reveals information about health, which makes it **special category data under GDPR
Art 9(1)**. Processing it is prohibited outright unless Art 9(2)(a) *explicit consent* applies — a
higher bar than the ordinary consent covering the email address, requiring a separate, unbundled,
affirmative act.

So the server enforces it: **if `consent_health` is not `true`, `motivation` is discarded and never
written, even when the user selected values.** That is correct behaviour, not a bug. But it was
enforced in code and absent from this contract, which meant the only way to discover it was to read
the source — and until someone did, every health answer would have been collected and silently
thrown away. Hence this section.

`motivation` is never sent to a third-party analytics tool. Analytics gets counts, never values tied
to an email.

### `zip` is US-only — scope note

The `/^[0-9]{5}$/` pattern is a US ZIP code. It is **not** a universal postal code field, and this
is deliberate rather than an oversight to be widened.

**Only render this field to visitors you believe are in the US**, and leave it out entirely
otherwise. If you need postal codes from other countries, say so and the contract gets a separate,
properly-scoped field — do not loosen the regex, because a permissive pattern that accepts anything
is not validation.

**`zip` is the one lenient field in this contract.** An unrecognised value — a Norwegian `0150`, a
UK `SW1A 1AA`, a Brazilian `01000-000` — is **dropped to `null` and the submission succeeds**. It
does not fail validation.

This is deliberate and narrowly scoped. Deciding whether to show the field is a client-side region
guess, and guesses are wrong sometimes; under strict validation a wrong guess in the
US-but-actually-not direction rejected the *entire submission* and took the email with it. A postal
code is worth far less than the address it was attached to, so it yields. Defence in depth behind
the client's guard, not a replacement for it — still only render the field to US visitors.

**Every other field stays strict.** Unknown keys, bad enums, malformed emails and missing consent
all still return `400`. A non-string `zip` also still returns `400`: that is a malformed client or a
probe, not somebody's postcode. Dropped values are logged as `zip.dropped_not_us_format` with the
derived country, which is the feedback loop for tuning the region guess.

### `glp1_medication` — gated on the wording, not a flag

Approved 2026-08-19. Phrased as a fact about the person ("I'm on a GLP-1
medication"), never as a product benefit — the guardrails forbid GLP-1 and
weight-loss claims, and **collecting it is not permission to market on it**.

It is accepted only when `motivation_consent_text_version` resolves to a wording
that actually names medication. The general health consent does not, so pairing
the value with the older sentence is a `400`. Registered wording that covers it:
`2026-08-19.health-medication.a`.

The check reads the verbatim text rather than a flag on the entry, so **editing
the copy to drop the mention closes the gate on the same deploy**. It is also
the literal legal test: Art 9(2)(a) consent must be specific, and a sentence
either names the thing or it does not. Fails closed — an unresolvable version
covers nothing.

Retention for records carrying it is **6 months**, not the 12 that other health
data gets. The reason is accuracy rather than sensitivity: medication status is
perishable, and an eleven-month-old answer may simply be false.

### Two enums are mid-migration, and the old values are NOT comparable

`quantity_band` and `price_band` each accept two generations at once, so the
client can switch without a coupled deploy. Both create a break in the data that
anyone querying the sheet has to know about.

| Field | Legacy values | Current values | Why they cannot be pooled |
|---|---|---|---|
| `quantity_band` | `lt_4 … gt_30` | `srv_1_2 … srv_gt_20` | Legacy counts **bites**, current counts **servings**, and one serving is five bites. `9_16` and `srv_6_10` overlap as ranges while meaning quantities five times apart |
| `price_band` | `lt_24 … gt_42` | `25_34`, `35_44`, `gt_45`, `other` | Different boundaries. There is no mapping from one set to the other that preserves meaning |

The `srv_` prefix exists for exactly this reason and **must not be dropped**:
unprefixed, a query that pools both generations is quietly wrong. Prefixed, it
is obviously wrong. A mistake you can see beats a mistake you cannot.

Treat each as two series, the way `social` → `instagram`/`tiktok` is already
treated. Legacy values are removed once the client stops sending them —
client-first, per the rule below.

**Watch `price_band_other` for answers below the lowest band.** "Under $24" was
dropped, so someone who would pay $20 now has to use Other. If those come in
often, the band set is wrong rather than the respondents — the Conversion
agent's observation and worth acting on rather than filing.

### Enum changes: ADD server-first, REMOVE client-first

The two directions are not symmetric, and getting the order wrong loses signups.

| Change | Order | Why |
|---|---|---|
| **Adding** a value | **Server, then client** | The client sending a value the server does not know is a *value* error. It 400s the whole submission, and the downgrade ladder cannot recover it — the ladder strips unknown **keys**, and this is a known key with an unknown value. Land the enum first and the window never exists. |
| **Removing** a value, or a field | **Client, then server** | The mirror image: stop sending it before the server stops accepting it. This is what made `motivation_other` a coupled change. |

**One caveat on REMOVE, now that the client keeps a persistent offline queue.**
Failed submissions are parked in `localStorage` and replayed on a later visit,
so "the client stopped sending it" is not the same as "nothing will send it
again". A payload queued before a switch still carries the old value, and on
replay it 400s and is discarded rather than retried. Zero risk for the 19 Aug
removal — that queue has never run in production — but for any future removal,
wait out the queue as well as the deploy.

Neither is caught by the downgrade path. It is an emergency valve for schema
lag on keys, and value errors are outside what it can see — the endpoint
deliberately does not say *which* field failed, because that turns a 400 into an
enumeration oracle. That opacity is correct and it is exactly why the ordering
rule has to be written down instead of discovered.

### Multi-selects have no product cap

`motivation`, `dietary` and `channel` accept as many values as apply. The old
"max 3" was a product decision that made people rank reasons they hold equally,
so the answer came back a ranking artefact rather than the truth.

What remains is structural, not policy: after de-duplication an array of enum
members cannot hold more distinct values than the enum has, so that is the
bound — and it is computed from the enum, so **adding a value raises the cap
automatically**. Per-item validity is the enum itself; total payload size is the
8 KB body limit. Neither changed.

### Four consents, four records — the same pattern each time

`marketing`, `health`, `sms` and `postal`. Each has a boolean flag, its own versioned wording
identifier, and its own block in the consent receipt. Each one gates a field:

| Consent | Flag | Version field | Gates |
|---|---|---|---|
| Marketing | `consent_marketing` **(required true)** | `consent_text_version` | the signup itself |
| Health | `consent_health` | `motivation_consent_text_version` | `motivation`, `motivation_other`, `dietary`, `dietary_other` |
| SMS | `consent_sms` | `sms_consent_text_version` | `phone` |
| Post | `consent_postal` | `postal_consent_text_version` | the six `address_*` fields |

**A gated field supplied without its consent is discarded, not stored.** Same rule `motivation` has
always had: typing something into a form is not the same as agreeing we may keep it.

**A consent claimed without the thing it gates is a `400`.** `consent_sms` with no phone, or
`consent_postal` with no address, records an opt-in that can never be acted on and cannot be
evidenced against anything.

**Consent wordings are no longer hand-registered.** The Conversion agent derives each version id by
fingerprinting the wording itself (`<purpose>-<region>-<authored>-<fnv1a>`), so editing a word mints
a new id automatically and an id can never go stale. `npm run build:consent` reads
`src/content/copy.js`, recomputes the same ids, and generates the registry the server uses to embed
verbatim text in each consent receipt. It runs as part of `npm run build`, so a copy change cannot
ship with a stale registry. Edit the wording in `copy.js` and nothing else.

### `phone` is strict — it does not fail soft like `zip`

An invalid phone number returns `400` for the whole submission. That is deliberate and it is the
opposite of the `zip` rule, for a reason: a ZIP field shown by a wrong region guess is one the
visitor never asked to see, whereas a phone number is something they chose to type. Silently
discarding it while recording an SMS consent against nothing is worse than saying it is wrong.

**So validate phone inline on the client.** This 400 should never be the first the user hears of it.

### Two postal codes, deliberately not merged

| Field | Format | Purpose | On bad input |
|---|---|---|---|
| `zip` | US only, `/^[0-9]{5}$/` | shipping-region signal | **dropped**, signup succeeds |
| `address_postal_code` | international | part of a real mailing address | `400` |

Do not merge them and do not widen `zip`. One is a coarse analytics hint that must never cost a
signup; the other is part of an address someone expects post to arrive at.

### The downgrade path — an emergency valve, with an alarm

The client retries with extensions stripped if the server 400s a payload carrying them. That stops a
schema lag losing signups, and it stays. But it converts a loud failure into a silent one, so two
rules make it visible:

1. **A downgraded retry MUST send `downgraded_fields`** naming what it stripped. The row is written
   with `is_downgraded=TRUE` and the field list, so an incomplete record looks incomplete in the
   sheet instead of looking like someone who skipped step 2.
2. **The valve must stay shut.** `npm run security:test` builds the Conversion agent's exact payload
   and asserts the server takes it whole. If either side renames a field or changes an enum, that
   test fails immediately rather than the drift being absorbed and surfacing months later as empty
   columns.

### Confirmed opt-in — gates the send list, never the dataset

Every signup is written with `confirmed=FALSE` and stays in the sheet whether or not the
confirmation link is ever clicked. **Nobody is deleted for not confirming.** Filter the *send list*
on `confirmed=TRUE`; keep the whole sheet as the demand record, so the 10–30% who never click remain
visible as signal.

`confirmed`, `confirmed_at` and `email_handle` are server-set and rejected from a client.

### Audience token vocabulary for consent version ids

The server reads which legal regime a consent wording was written for from the identifier itself,
tokenised on `.`, `_` and `-`. This is how a record gets flagged when someone in Oslo is served the
US consent copy — via VPN, travel, a CDN edge decision, or a stale cached bundle.

| Token | Regime | Notes |
|---|---|---|
| **`eea`** | EEA / UK | **canonical** |
| `eu`, `gdpr`, `uk` | EEA / UK | accepted synonyms |
| **`us`** | United States | **canonical** |
| `usa`, `canspam` | United States | accepted synonyms |
| *(none present)* | `unknown` | **flags EEA records as `unverifiable`** |

So `mkt-eea-2026-08.a` → EEA, `mkt-us-2026-08.a` → US, `mkt-2026-08.a` → unknown.

Matching is on whole tokens, not substrings — `2026-08-15.august.a` is *not* US-targeted. An
untagged id on an EEA visitor sets `consent_regime_status: unverifiable`, because Art 7(1) asks us
to demonstrate consent and "we cannot tell what wording they saw" is not a demonstration. Tag every
id and that state disappears.

A wording written to satisfy the strictest regime and used everywhere should be registered in
`CONSENT_TEXTS` (`src/lib/validation.js`) with `regime: 'global'`, which clears the flag without
needing a token.

## Branch + file ownership (this is what makes "simultaneous" work)

Each agent works on its own branch cut from `main` and touches **only** its owned paths.

| Agent | Branch | Owns |
|---|---|---|
| UI/UX | `ux/mobile-redesign` | `src/styles/**`, `src/components/ui/**`, layout/section/nav/footer components, `public/images/**`, font files |
| Conversion | `growth/waitlist-conversion` | `src/components/waitlist/**`, `src/lib/analytics.ts`, page copy files, `src/content/**` |
| Security | `sec/hardening` | `src/app/api/**` (or `server/**`), `middleware.ts`, `next.config.*`/`vite.config.*` security sections, `src/lib/validation.ts`, `src/lib/ratelimit.ts`, `.env.example`, `/privacy`, `/terms`, security docs |

Rules for all three:
1. `git checkout main && git pull && git checkout -b <your-branch>` before any edit. Never commit to `main`.
2. If your work requires a change in a file you do not own: **do not edit it.** Append the request to your own handoff file: `HANDOFF-ux.md` / `HANDOFF-growth.md` / `HANDOFF-sec.md` at repo root. Each agent writes only its own handoff file, so these never conflict.
3. Commit in small, self-describing commits. Do not rebase or force-push. Do not merge another agent's branch into yours.
4. `package.json` is shared. Adding a dependency is allowed but list every addition at the top of your handoff file with a one-line justification, so merge conflicts there are resolved in seconds.
5. Merge order is **UX → Conversion → Security**. Assume your branch will be merged in that order; write code that tolerates the other two not existing yet.
6. Never commit secrets, `.env`, real customer data, or API keys. Never run destructive git commands (`reset --hard`, `clean -fd`, `push --force`).

## Universal constraints

- **Mobile-first, and mean it.** Design at 390×844 first. Test 360px width (nothing may horizontally scroll), 390px, 430px, then 768/1280. Thumb-zone: primary CTA reachable in the bottom third. Tap targets ≥44×44px. Inputs `font-size:16px` minimum so iOS does not zoom on focus.
- **Performance budget:** LCP < 2.0s on simulated Fast 3G / 4x CPU throttle, CLS < 0.05, INP < 200ms, total JS shipped to the landing route < 120KB gzipped, hero image < 150KB (AVIF/WebP with fallback, explicit width/height, `fetchpriority=high`).
- **Accessibility:** WCAG 2.2 AA. Real `<label>`s, visible focus rings, `prefers-reduced-motion` respected, form errors announced via `aria-live`, keyboard-completable, `inputmode="email"` and `autocomplete="email"`.
- Do not add a cookie banner unless a tracker requires one — prefer analytics that doesn't.
- Ask before installing any heavy framework or animation library. Prefer CSS.

## Definition of done for every agent

Post a short report: what changed, why, screenshots or measured numbers, what you did NOT do and why, and the contents of your handoff file. Then stop — do not merge to `main` yourself.
