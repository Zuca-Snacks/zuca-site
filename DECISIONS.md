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

## ⚠️ MEASURING A BRANCH: use three dots, never two (19 Aug 2026)

**This has now cost three sessions in one week.** It is not a subtle bug; it is
the obvious command giving a confidently wrong answer.

### The trap

To ask "what would merging this branch do?", the reflex is:

```
git diff --stat HEAD origin/sec/hardening        # ← WRONG
```

Two dots diffs the two *heads*. Everything `main` has that the branch has not
yet merged reads as a **deletion**. Measured on the same two refs at the same
moment:

```
two dots:    228 files changed,  1879 insertions(+), 17105 deletions(-)
three dots:    2 files changed,    93 insertions(+),    12 deletions(-)
```

The real merge deleted nothing and added nothing. The 17,105 deletions included
`base.css`, `tokens.css`, `fonts.css`, `analytics.js`, the hooks, and the entire
`failure-paths.test.mjs` — plus an *added* `src/zuca-gate-v4.jsx`, a gate file,
against a standing rule that the gate is removed. All of it phantom.

### The correct commands

```
git diff --stat HEAD...origin/sec/hardening      # three dots: from the merge base
```

Three dots diffs from the **merge base** — what the branch actually changed
since it diverged, which is what a merge will apply.

To see exactly what a merge does to *your* tree, stage it without committing:

```
git merge --no-commit --no-ff origin/sec/hardening
git diff --cached --diff-filter=D --name-only     # what it DELETES
git diff --cached --diff-filter=A --name-only     # what it ADDS
git diff --cached --stat                          # everything it changes
git merge --abort                                 # if you were only looking
```

⚠️ **One `--no-commit` merge at a time.** Git refuses a second while the first
is unconcluded. Security lost twenty minutes to this: they scripted two in
sequence, suppressed the output, then `git add -A`'d — it looked like eleven
merge failures and in fact the second merge had simply never run.

### Why it keeps happening

The wrong command is shorter, it is what autocomplete offers, and its output is
*plausible* — a big scary diff looks like a big scary branch. Nothing about the
result says "you measured divergence, not change". Treat any diff against a
long-lived branch that reports mass deletions of files nobody touched as this
bug until proven otherwise.

---

## ⚠️ VERIFYING AGAINST SOMETHING OTHER THAN WHAT YOU THINK (19 Aug 2026)

Three sessions hit this in one day, in three different disguises. It is the same
failure each time, so it gets **one entry with three instances** rather than
three entries that look unrelated. Companion to `docs/verification-traps.md`,
whose rule — *validate the instrument against a known-positive before trusting a
negative* — is the same principle pointed at the harness instead of the tree.

### The general form

**You verified something. It was not the thing you believed you were verifying.**

The result is always confident and always wrong, because nothing in the output
says which artifact it actually read. Every instance below produced a clean,
plausible answer about a thing that was not under test.

### Instance 1 — a generated artifact disagreeing with its source (merge session)

Six checks reported the S22 business consent gate was dead. `copy.js` was
correct throughout; `src/lib/consent-registry.generated.js` on disk held a
truncated wording. The file is gitignored, so `git status` was clean and no diff
pointed at it.

> **Rebuild the registry before believing a consent-gate failure.**
> `npm run build:consent`

Now enforced by a check — *"the generated registry matches copy.js verbatim"* —
which fires with the cause named and the command to run. It does not reduce six
failures to one; it makes one of the seven tell you where to look.

### Instance 2 — testing a change that was never committed (security)

A merge took the committed version of a file. The new check was simply absent,
the old failures reappeared, and it read as *the check does not work*. It had
never run.

### Instance 3 — a diff against the wrong base (all three sessions)

`git diff HEAD <branch>` measures divergence, not change — see the two-dot entry
above. Same shape: a real command, a real answer, about the wrong comparison.

### The rule

**Check what is actually in the tree you are testing, not what you think you put
there.**

Concretely, before trusting a red result: confirm the change is committed and in
*this* tree, rebuild anything generated, and confirm the comparison base is the
merge base. All three cost debugging time only — none reached production — but
each one first presented as a serious product defect, and two nearly went into a
report to Emil as one.

---

## S23 — every step 2–4 answer was discarded in production (19 Aug 2026)

Found by Emil, walking a live signup on the production site within an hour of
the first deploy. Fixed the same day by security and growth; confirmed fixed by
a second live signup — profile answers persist, exactly one row per address.

### What happened

The waitlist form saves on every screen advance, so a person who abandons at
screen 3 still has their email. Four screens, four POSTs, each carrying the full
payload including `email`. `Step2Profile.jsx` called that operation an *upsert*.
Nothing in the system implemented one.

`/api/waitlist` checked for duplicates at step 9 and forwarded to the sheet at
step 12, so it returned before ever reaching the sheet:

```
if (await isDuplicate(handle)) {
  audit('duplicate', { handle });
  return send(res, 409, { ok: false, error: 'duplicate' });
}
```

`isDuplicate` is an atomic `SET NX` with a 400-day TTL. POST 1 set the key;
POSTs 2–4 found it and were rejected. The client then mapped 409 to
`RESULT.DUPLICATE` and treated it as success — correct on step 1, where it means
"you are already on the list", and wrong on every later save, where it means the
answers were thrown away. The person saw the confirmation screen. Four live
signups were affected before it was caught.

### The fix

An authorised update path: the server issues an `edit_token` on the first write,
the client returns it on later saves, and a known handle routes to an update
instead of a 409. `edit_token` is now in `MINIMAL_KEYS` — the floor of the
downgrade ladder — because a rescue rung that drops it writes a 409 and calls it
saved.

### What generalises — a missing world, not a missing assertion

**Two hundred passing checks could not express the state the bug lived in.**

```
if (!DURABLE) return false;
```

`DURABLE` is false without Upstash. Upstash existed only in production. So the
duplicate check — the entire failing branch — never ran locally, never ran in
CI, and never ran in any of the 200 checks. Every green run was green because
the code that breaks was switched off.

This is the failure mode worth remembering: not a test that forgot to assert
something, but a **world the suite could not construct**. No amount of care
writing assertions would have found it, because there was no state in which to
assert. The bug shipped through a suite that was, on its own terms, exhaustive.

**`npm run security:repeat` exists to make that world constructible.** It runs
the repeat-signup sequence twice, once without the secret and once with it, and
prints what actually reached the sheet:

```
reached the sheet: [{"action":"create",...},{"action":"update",...},{"action":"update",...}]
```

It is not a regression test for S23. It is the missing world, kept around so the
next bug of this shape has somewhere to show itself. Treat "this code path only
runs when an env var is set" as a gap in the harness, not a detail of deployment.

### The other half — why S24 took one comparison

S24 (growth's downgrade ladder strips seventeen fields when health consent is
declined, including SMS and postal consents the person granted) was found
immediately, by comparing two rows.

That was possible because **`is_downgraded` and `downgraded_fields` are written
to every row.** A downgraded record is not merely incomplete, it is *labelled*
incomplete and says which fields went. Without those columns a stripped row is
indistinguishable from someone who skipped step 2 — "looks normal but isn't",
which is the exact condition the endpoint was built against.

The cost was two columns. The return was finding a consent-integrity bug in a
single comparison rather than by re-deriving what should have been there.

---

## Font licences — Lazy Dog purchase reference (Emil, 19 Aug 2026)

`public/fonts/LICENSE.md` records the licence terms and travels with the fonts,
because the OFL expects a redistributed face to carry its licence. It does **not**
carry the purchase order number: `public/` is copied verbatim into `dist/`, so
that file is served at `zucasnacks.com/fonts/LICENSE.md`, and an order reference
is not something a licence notice needs to publish.

**Lazydog Kids Font — JuliyArt, Creative Market Webfont License, order
`148142438`, purchased 19 August 2026. Cap: 10,000 pageviews/month.**

Outfit is SIL OFL and uncapped.

### Revisit trigger

**Traffic approaching 10,000 pageviews/month.** Nothing measures this. Nothing in
the build, in Vercel, or in the font file fails when the cap is passed — the
licence stops covering the site silently and the font keeps serving. Upgrading the
tier has to happen *before* the traffic arrives, which means it is a launch-
marketing decision rather than an engineering one.

---

## Art 27 EEA representative — the placeholder is removed and stays removed (Emil, 19 Aug 2026)

### What was decided

`public/privacy.html` carried two `[EEA REPRESENTATIVE … TO BE INSERTED BEFORE
LAUNCH]` markers — one in the body, one in the footer. Both are **removed, not
filled**, with no sample and no "TBD". The body paragraph went whole rather than
leaving the sentence *"GDPR Article 27 requires us to appoint a representative in
the EEA who you can contact instead of us"* standing above a blank.

**The removal stands. A paragraph naming nobody does not cure the appointment
obligation** — it only makes the page look like it has been dealt with.

### The objection on the record

Raised by the conversion agent after the removal, and verified independently:
`privacy.html` now contains **zero** occurrences of "representative", "Article
27" or "Art 27", against 7 mentions of the EEA in that file and 3 in
`terms.html`, with `api/waitlist.js:461` branching on `isEea()` to select the
consent regime. So the site distinguishes EEA subjects in running code.

Their argument: if Art 27 applies, **Art 13(1)(a)** requires the
representative's identity and contact details in the notice itself, so silence
is a *different* failure from a placeholder rather than a smaller one — nothing
now signals that anything is missing.

Emil's answer is that this is true and does not change the decision. Neither
state is compliant; only appointing a representative is. A placeholder does not
buy partial credit, and the marker's real function was to remind us, which is
what this entry is now for.

### Scope correction

The obligation was previously discussed as though it were triggered by *emailing*
EEA subjects, which made it look deferrable until a sender exists. **It is not.**
Art 27 follows from Art 3(2) — offering goods or services to people in the Union
and processing their data. **We collect from EEA subjects the moment the waitlist
is live**, region-detected consent wording and all. The question is therefore
live at publication, not at first send.

### Revisit trigger

**The Cooley review.** It is the only thing that can close this, since appointing
a representative is a legal engagement rather than a code change. Nothing in the
repository can detect the omission, and no test will fail because of it.

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

---

# Recorded decisions, with revisit triggers

Choices that were **made**, not defaults that were **inherited**. If something here looks like an
oversight later, it was not — the reasoning is recorded so it can be overturned deliberately rather
than rediscovered from scratch.

Each entry states what was decided, why, and **what would make us revisit**. Where a revisit trigger
can be made mechanical it is, because a trigger nobody checks is a comment.

---

## D1 — Consent wording ships English-only

**Decided by Emil, 2026-08-19.** Raised independently by security and conversion.

### What was decided

The consent wordings — marketing, health, SMS, postal, and the S22 business basis — ship in
English only. No Norwegian translation, and no per-language machinery built in anticipation of one.

### Why it is a decision and not an omission

Two server-side gates read the **verbatim text** of a consent wording rather than a flag:

| Gate | What it requires the sentence to contain |
|---|---|
| `consentCoversMedication()` | that medication is named, before a GLP-1 answer may be stored (Art 9) |
| `businessConsentGaps()` | the organisational basis, the exclusion promise, and a stop mechanism (S22) |

Both match English phrases. **Norwegian copy fails every element:**

```
"Jeg spør på vegne av arbeidsplassen min. Dette er en bedriftshenvendelse."
    refused — missing: basis, exclusion, stop_mechanism
```

That is **fail-closed** — nothing unlawful is stored — but from a translator's point of view the
office and health paths simply stop working, with a rejection naming English element ids.

So shipping English is not the absence of a translation. It is the condition the gates were built
against, and translating without touching them would take two paths down.

### The reasoning for English-only

- Norwegian recipients read English fine; this is a waitlist, not a contract of sale.
- The EEA send is Cooley-gated regardless, so the wording faces review before it reaches anyone.
- Both alternatives — a per-language element list, or a structured claim the copy declares
  alongside its text — are machinery for a requirement that does not exist yet. Conversion's name
  for that is worth keeping: **`NEVER_WRITTEN` in the other direction** — infrastructure for a case
  nobody has asked for, which then has to be maintained and believed.

### ⚠️ Do not read this entry as a plan

A note about a constraint has a way of becoming evidence of a roadmap three weeks later. **Nothing
here says localisation is planned.** It says that if it happens, two gates need a decision first.

### Revisit trigger — mechanical, not remembered

The trigger fires by itself. `scripts/attack-waitlist.mjs` asserts that each registered consent
wording still passes its own gate, reading the **registry** rather than a copy of the string:

```
✓ the registered wording passes its own gate
```

**Translate a gated wording and that test fails.** It is the only warning the system gives, and it
is enough, because it fires at the keyboard rather than after launch. When it does fire, the
question is not "which regex do I widen" — it is this entry.

The two options, for whoever is standing there:

1. **Per-language element lists** — one set of required phrases per locale. Simple; grows linearly
   with languages and rots quietly in the ones nobody tests.
2. **A structured claim** — the copy declares which elements it contains (`basis`, `exclusion`,
   `stop_mechanism`) alongside its text, and the gate checks the declaration rather than the prose.
   Language-independent, but moves the burden onto whoever writes the copy being honest about it —
   which is the thing verbatim matching exists to avoid trusting.

Neither is obviously right, which is the other reason not to build one today.

**Owner:** whoever proposes the first non-English consent wording.

---

## D2 — `privacy@zucasnacks.com` created before publication

**Closed by Emil, 2026-08-19.** Recorded because the *reason* it blocked publication is easy to
misremember as pedantry.

`public/privacy.html` names the address in three places as the GDPR Art 15–22 rights channel. The
defect was never "a link might bounce". It was that publishing a rights channel which does not
exist is an **Art 12(2)** failure — the controller must *facilitate* the exercise of rights — and
the asymmetry is what makes it serious: the person believes they exercised Art 15, we never learn
they tried, and the only evidence sits in a bounce message on their side. A controller cannot
demonstrate compliance with a request it has no record of receiving.

Now a Workspace alias on Emil's account, test message sent and received.

**Superseded 2026-08-19 (Emil).** This entry previously listed the Art 27 EEA representative and
the postal address as `[TO BE INSERTED BEFORE LAUNCH]` placeholders on the same page. Emil's call
was to **remove** all three markers rather than fill them, with no sample and no "TBD"; the Art 27
paragraph went whole, since a stated obligation with nobody named against it reads worse than
silence. Neither page now claims a representative or an address it does not have.

What remains open is narrower and belongs to the first send, not to publication: `privacy.html`
§11 commits that every email carries a physical postal address, and no address exists yet. Emil
has decided that sentence stays — it is true today by vacuity and will be true when a sender
exists, because he cannot lawfully send without the address. **Revisit trigger:** the first
transactional or marketing send. There is no sender in the codebase today, so nothing can fire it
early.
