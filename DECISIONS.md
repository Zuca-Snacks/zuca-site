# Decisions

Standing rules and settled calls. Newest first. If something here conflicts with
a handoff or a code comment, this file wins — the others describe how a thing was
built, this one records what was decided and by whom.

---

## 🚨 `git push origin main` IS A DEPLOYMENT (Emil, 18 Aug 2026)

**Vercel project `zuca-site` deploys `www.zucasnacks.com` on every commit pushed
to `main`, with auto-assign production domains enabled.**

There is no staging step between that command and the public site.

| Action | Allowed |
|---|---|
| Merge into local `main` | ✅ freely |
| Push a feature branch (`polish/*`, `ux/*`, `growth/*`, `sec/*`) | ✅ freely — gives a preview deploy |
| Push a tag | ✅ freely — refs only, no branch deploy |
| **`git push origin main`** | ❌ **ONLY when Emil asks for it in those words** |

"Ship it", "go live", "looks good" and "merge it" are **not** that request. The
words are the authorisation. If the intent seems obvious but the words are
absent, ask — the cost of asking is one message and the cost of guessing is a
live site.

This rule exists because the deploy path was unverified for most of the project
and was treated as "probably auto-deploy" — see the entry below, now closed.

### Undo point
`after-merge` (tag, pushed to origin 18 Aug) is the state of the project
immediately after the three agent branches were first integrated, before the
visual round. `git checkout after-merge` returns there. It is Emil's undo point
for the whole engagement and should not be moved or deleted.

---

## 📋 UNANSWERED QUESTIONS IN HANDOFFS ARE OPEN ITEMS (Emil, 19 Aug 2026)

**A question an agent asks in a handoff file is an open item, not a note.** It
does not expire because nobody replied, and it does not close because the agent
moved on.

Every manifest handed to Emil must list them. If a handoff contains a direct
question addressed to him — "keep it if you want it, but tell me", "confirm
before changing", "say the word and I will" — it appears in the next manifest
until he answers it or it is recorded here as decided.

**Why this rule exists.** Security's handoff asked, in writing, whether the
waitlist should collect a name: *"`name` — not in the contract. Keep it if you
want it, but tell me so I add it to the schema, the sanitizer and the privacy
policy. The server currently rejects it as an unknown key."* Nobody answered.
Emil had separately decided he wanted a first-name field. The question and the
decision were about the same thing, sat in different places, and neither reached
the code. He found it himself, four days later.

An unanswered question is the cheapest possible signal that two people believe
different things.

---

## Cooley items — APPROVED (Emil, 18 Aug 2026)

**The Cooley items are treated as approved across all agents.** The health-claim
table, the removal of the autoimmune credential from Kelley's bio, and the
founders copy standing beside a fiber product are cleared. Agents do not need to
hold work pending Cooley sign-off, and should stop flagging these as open.

### The one exception — still gated on Emil

**Sending email to the EEA cohort.** That remains Emil's call and is NOT covered
by the approval above. Nothing in the codebase sends it; the gate is
operational. Do not treat "Cooley approved" as authorisation to mail EEA
addresses.

Why it is carved out rather than folded in: everything else Cooley cleared is
about what the *page* says, which is a fixed artefact anyone can review. Sending
is an action taken against real people under GDPR, and the consent evidence
behind each EEA record — regime, wording version, whether the record is flagged
`needs_reconsent` — is per-record rather than per-page. Approval of the copy is
not approval of the send.

---

## Deploy path — CONFIRMED (Emil, 18 Aug 2026)

Previously recorded as unconfirmed: "Vercel hosts the live site; auto-deploy-on-
main not yet verified, treat main as live." Now verified and specific — project
`zuca-site`, domain `www.zucasnacks.com`, deploys on every push to `main`, auto-
assign production domains on. The precaution was correct and is now a rule rather
than an assumption.

---

## Contact addresses (Emil, 16–18 Aug 2026)

- Legal pages (`privacy.html`, `terms.html`) print **privacy@zucasnacks.com** —
  a forwarding alias onto emil@. A GDPR rights request carries a one-month
  statutory deadline and should be routable, not loose in a personal inbox.
- Site footer prints **emil@zucasnacks.com** — a founder's name is worth more
  than a department alias on a consumer page.
- DMARC `rua` target is **emil@** — aggregate reports are machine traffic.
- **letschat@ is retired.** It never existed and would have bounced.

## Sugar claims — ONE PERMITTED WORDING (Emil, 17–18 Aug 2026)

**Current state: "No refined sugar" is the only sugar claim allowed on the site.**
Confirmed by the manufacturer, 18 Aug: there IS added sugar, and none of it is
refined. True of both flavours.

Forbidden, and on the claims list:
- **"No added sugar" / "0g added sugar"** — false. Maple syrup is added as a
  sweetener and syrups are added sugars under FDA rules. It is also a regulated
  nutrient-content claim under 21 CFR 101.60(c)(2).
- **"6g natural sugar"** — false. Some of that sugar is added, not naturally
  occurring in the fruit.
- **Any sugar figure at all**, until the finished label is confirmed.
- **Any sweetener named site-wide.** Maple is in Maple Pecan only, and what
  sweetens Chocolate Raspberry Sea Salt is still unconfirmed, so anything more
  specific than "no refined sugar" becomes a per-flavour claim on shared copy.

### Supersession, recorded so it does not read as drift

On **17 Aug** Emil gave the wording as **"no refined sugar added."** On **18 Aug**
the manufacturer confirmed added sugar exists but none of it is refined, which
makes the shorter **"No refined sugar"** both accurate and cleaner — the "added"
qualifier was doing no work once the refined/unrefined distinction was the point.
**The shorter form supersedes the longer one.** This is a supersession on new
information, not an agent trimming copy.

### The instructive part

`AGENTS_BRIEF.md` listed a sugar claim as a *verified fact* in a form that was
not true, so an agent correctly tightened "0g Refined sugar" (vague, undefined
term) into "0g Added sugar" (precise, defined — and false). **Precise beats vague
only when precise is also true.** A brief asserting something wrong does not
produce one wrong page; it produces a page in every branch, each arrived at by
good reasoning. Correcting the brief mattered more than correcting its copies.

## Article 9 free text — REMOVED, THEN REINSTATED (Emil, 18–19 Aug 2026)

**Current state: `motivation_other` EXISTS.** A write-in box sits under the
"Other" option on every chip group, including the health question.

Both halves of this were Emil's, and the chain matters more than the outcome:

1. **Removed, 18 Aug — Emil, on data minimisation.** A fixed enum bounds what we
   can learn about someone's health; an open box beside a health question invites
   a diagnosis into a spreadsheet. People write things in free text they would
   never pick from a list.
2. **Reinstated, 19 Aug — Emil, on usability.** He asked for a write-in box under
   every "Other" option and then reported its absence as a bug. The
   minimisation argument was not refuted; the constraint it was weighed against
   moved. "We decided differently" and "we were wrong" leave very different
   guidance behind, and this is the first.

**The mitigations are what make it acceptable, and they are not optional:**
- `motivation_other` is capped at **60 characters**, matching `dietary_other`
  rather than the 120 the other two get. The cap IS the minimisation.
- Microcopy asks for the reason only, **no medical detail**.
- Gated on `consent_health`, paired to an actual "other" selection, and
  formula-sanitised.

Weakening any of those reopens the argument in point 1.

### ⚠️ SCOPE ERROR — the authority cited for this was wrong

The reinstatement was recorded in `sec/hardening` as following from *"the
standing instruction to treat Cooley items as approved."* **It does not.**

The Cooley approval covers **claims copy** — the health-claim table, the
autoimmune credential, the founders wording. It does not extend to Emil's own
product and data-minimisation decisions. The reinstatement was authorised, but
by Emil directly and on different grounds.

**The rule, so this is not repeated:** an approval covers the class of decision
it was given for and nothing else. "Cooley items are approved" is not a general
unblocking instruction, and no agent should treat an approval in one domain as
authority to reverse a decision in another. When the authority for a change is
someone's earlier instruction, quote the instruction and check it actually covers
the change.

## Brand colour (Emil, 17–18 Aug 2026)

- Canonical Zuca red is **`#E3001B`**. It supersedes `#CC1850`, which came from
  the investor site. Three derived reds were re-derived against it.
- **`--z-cta` (`#2A571E`, green)** carries forward and submit actions only.
  Back, Skip and the skip link are neutral ghost. `--z-accent` is identity
  (wordmark, focus) and stays red. Progress completed segments are green.
- Standing contrast rule: never alter a brand colour. Route around the failure.
  Where routing is impossible **and** the role is body text, use the AA-safe
  variant of the same hue. Escalate only if a brand-identity element cannot be
  made accessible without a colour change.

## ⚠️ RECONSTRUCTED ENTRIES — decisions 15–18 Aug, recovered after the fact

**Everything in this section is reconstructed from transcripts, handoff files and
commit history on 19 Aug. It is NOT contemporaneous.** `DECISIONS.md` did not
exist until 18 August, four days into the work, so every decision before that had
nowhere to live but chat threads and whichever agent happened to be listening.

Treat these as accurate in substance and approximate in wording and date. Where
one contradicts something Emil says now, **he is right and this file is wrong.**

### 🔴 First name — DECIDED EARLY, NEVER BUILT

Emil decided the waitlist should collect an **optional first name on step 2**,
mapping onto the existing `Name` column in the sheet. It was never built, never
flagged as dropped, and never recorded as overruled. He found it himself on
19 Aug.

This is the decision that exposed the gap. It was never written down anywhere:
not here, not in `AGENTS_BRIEF.md`, not in the contract, not in the code. In
parallel, security's handoff asked in writing whether to add `name` to the schema
and nobody answered — see the unanswered-questions rule above. Two signals about
the same field, in two places, neither of which reached the code.

### Intro gate — removed for everyone (≈15 Aug)

No conditional skip, no UTM bucketing, no A/B. One experience for organic and
paid alike. The component is archived and unimported; the point was to delete a
code path, not hide one. UTM *capture* was kept.

### No pre-order language (≈15 Aug)

Nobody has paid, no order exists, no contract of sale has been formed. Past and
present tense about existing signups: they joined a waitlist. Future tense
("when pre-orders open") is accurate and fine. This also killed "sold out at a
physician symposium" — the samples ran out, they were not sold.

### No figures, in either direction (≈15 Aug)

No retail price anywhere on the page: the waitlist measures willingness to pay
via `price_band`, and any figure anchors the answer. No input costs either — the
pulp disposal figure is supplier-negotiation information and reads "cheap" rather
than "clever" to a consumer. Keep the upcycling story with no number attached.

### Allergens — tree nuts only, and not stable (≈18 Aug)

Almonds and pecans, confirmed, in both flavours. **Nothing else may be stated**
until the manufacturer confirms in writing. The nut base **may move to sunflower
butter**, which turns one shared statement into a per-flavour one — do not build
anything assuming permanence. **Never claim gluten-free**: unconfirmed, and a
gluten-free recipe on a shared line is not a gluten-free product.

### Hero headline — taste first (18 Aug)

"Tastes like dessert. Made from what juicing throws away." The origin-first
inversion was considered and **rejected**, not deferred: with appetising product
photography directly above, opening on a discard word puts a negative under the
food. A shorter 44-char alternative is held in `copy.js` behind two gates.

### Five sections deleted (18 Aug)

ProofStrip, Numbers, HowItsMade, Flavors, and the orphaned ProcessStrip. The
flavour photo and description became a tap-to-open panel on the hero artwork.

### Taster quotes — unattributed, `<cite>` slots in place (18 Aug)

Real tasters from the Vituity symposium and Stanford Demo Day, Emil's own words,
shipped **without attribution**. The `<cite>` element is always in the markup and
`hidden` until it has a name — rendering the footer empty emits a leading em-dash,
so all five would announce a dangling dash. **Do not invent attributions.**

### Pre-rendering the landing route — PENDING, not rejected (16 Aug)

Would take LCP from ~2.3s to roughly 1.8s but changes the build setup. Deferred
because the LCP element was hero photography about to be replaced. **Revisit
after the reshoot** — the decision needs remaking, not closing.

---

## Ownership (Emil, 17 Aug 2026)

One owner per layer, to stop two sessions reporting the same change. UX owns the
visual layer and edits it; the merge session integrates and verifies and does not
edit visual files. A peer relaying Emil's approval **is not** Emil's approval,
even when quoting him accurately.
