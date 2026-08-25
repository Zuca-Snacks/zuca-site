# Decisions

Choices that were **made**, not defaults that were **inherited**. If something here looks like an
oversight later, it was not — the reasoning is recorded so it can be overturned deliberately rather
than rediscovered from scratch.

Each entry states what was decided, why, and **what would make us revisit**. Where a revisit trigger
can be made mechanical it is, because a trigger nobody checks is a comment.

> ⚠️ **MERGE SESSION:** this copy is stale — `main` carries a much longer version that already
> supersedes D1–D3 below. Take `main`'s, as last time, **but carry D4 across**. It is new here and
> exists nowhere else.

---

## D5 — ⚠️ EMAIL_HASH_PEPPER IS UNSET. DO NOT "FIX" IT.

**Recorded 2026-08-25. This is a trap, not a missing config.**

Production logs the fallback warning on every request. The obvious response — set the variable —
is a **one-way door**, and it is disguised as a two-second fix in the Vercel dashboard.

### What the variable actually does

`emailHandle()` returns HMAC-SHA256(email, pepper) when it is set, and plain SHA-256 when it is
not. Twelve hex characters either way. **Every handle in the system changes the moment it is
set.**

### Everything that is keyed on the handle

| | |
|---|---|
| Upstash claims | `seen:waitlist:<handle>` — all **156 committed keys**, including the remediation finished on 25 Aug |
| Edit tokens | signed over the handle; every in-flight form session (2h window) |
| Confirm tokens | same, 30-day window |
| The sheet | the `email_handle` column on **157 rows** |
| `updateRow_` | looks up the row **by handle** (`Code.gs:606`) |
| `confirmRow_` | same (`Code.gs:739`) |

### What setting it would actually do, in order of how bad

1. **Steps 2–4 would start creating DUPLICATE ROWS, silently.** An existing member's new handle
   matches no `email_handle`, so `updateRow_` returns `not_found` — and their claim is also gone,
   so the endpoint treats them as new and appends. A `200`, a second row, no error anywhere.
2. **Confirmation links stop working** for every existing row — `confirmRow_` finds nothing.
3. **156 committed keys are orphaned**, so duplicate protection is lost for everyone already on
   the list, while the dead keys sit there for 400 days.
4. **In-flight form sessions lose steps 2–4** — the S23 failure mode, reintroduced.

None of that announces itself. The warning it silences is the only loud thing in the picture.

### The options, and what each costs

| | Cost |
|---|---|
| **A. Leave it unset, permanently** | Handles stay reversible by enumeration, so the pseudonymisation is decorative — Recital 26. The sheet already holds the addresses, so the real exposure is **logs**: anyone holding them can confirm whether a known address is on the list. **SECURITY.md must be corrected**, because it currently documents a keyed HMAC as an active control and it is not one. A documented control that is not running is worse than an absent one. |
| **B. Set it and accept the break** | All four consequences above, silently, on live traffic. Not defensible for the benefit. |
| **C. Set it WITH a migration** ⭐ | Recompute every row's handle from its address, rewrite the `email_handle` column, rewrite the Upstash keys — one window, snapshot first, read every value back. Exactly the shape of the 25 Aug remediation, which worked. Only in-flight edit tokens are lost, so run it at a quiet hour. **The only option that keeps both the control and the data.** |
| **D. Adopt unkeyed as the scheme** | Same effect as A, but delete the pepper branch so nobody can set the variable by accident. Honest, and removes the trap entirely at the cost of ever having the control. |

### Recommendation

**C if the pseudonymisation is worth a migration; otherwise D.** A is C's cost with none of C's
benefit and leaves the trap armed. **B is the only one that must never happen**, and B is exactly
what "set the missing env var" looks like from the dashboard.

### ⚠️ The warning in the logs is not the problem

It is a correct description of a real weakness. Silencing it by setting the variable trades a
visible weakness for four invisible failures. **Whoever next sees that log line and reaches for
the dashboard: read this entry first.** The variable is not missing. It is deliberately unset
pending a decision between C and D.

**Owner:** Emil. Nobody else can set it, which is the only reason this is safe to leave.

## D4 — An uncaptured single-test failure, 2026-08-22

**Not a merge blocker. Recorded because dropping it would be the mistake it is about.**

### What happened

One run of `scripts/attack-waitlist.mjs` reported **218/219**. I did not capture which test
failed.

### The reproduction attempt, and why it failed

I grepped for the failure in a **follow-up run** rather than in the invocation that produced it.
That run passed, so the grep found nothing. Thirteen further runs — three, then ten — were all
clean at 219/219. The failing test is unidentified and the failure is unreproduced.

Candidate causes, none confirmed: the run happened moments after the file was rewritten; several
new tests mutate `process.env` and restore it in a `finally`; one deletes `META_PIXEL_ID`. Any of
these could interact with ordering. **All of that is speculation, which is the point** — the
evidence needed to choose between them was thrown away by re-running.

### The rule, going forward

**Capture the full output of a failing run in the same invocation that produces it.** Never grep a
follow-up run: an intermittent failure is precisely the kind that will not be there the second
time, and re-running to "check" destroys the only evidence there was.

This is the same shape as the entry about checking the tree you are actually testing. Both are a
green result being read as information about a different run than the one that produced it.

### Why it is written down rather than watched

A single unexplained failure in a suite of 219 is easy to carry as a private doubt and then forget.
Written down, it is either reproduced by someone later or it stays a known unknown — and a known
unknown is a fair thing for a suite to have. An unrecorded one is just a suite nobody quite
trusts, for reasons nobody can name.

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

**Still open on the same page, and the same class:** the Art 27 EEA representative and the postal
address are both still `[TO BE INSERTED BEFORE LAUNCH]` placeholders in `public/privacy.html` and
`public/terms.html`. Naming a representative that does not exist has the same shape as naming a
mailbox that does not — see SECURITY.md owner actions.

---

## D3 — Lazy Dog is licensed with a **usage cap**, and nothing watches it

**Licensed by Emil, 2026-08-19.** Creative Market Webfont License, order `148142438`.

Recorded here rather than ticked off a checklist, because the licence is not a one-time act. It is
a **standing condition with a number in it**:

> **10,000 pageviews per month.**

### Why that belongs in this file

A licence you can exceed by succeeding is a compliance obligation whose breach is triggered by good
news, arrives silently, and is discovered by the other party. It is the same shape as everything
else recorded on this branch — an unwatched threshold that reads as fine right up until it is not:

- nothing in the codebase knows the cap exists
- nothing in Vercel Analytics is set to alarm on it
- the month it is exceeded looks, from inside, exactly like the month before

10,000 pageviews is **not a lot** for a launch. A single well-performing post, one newsletter
mention, or the pre-order email to the ~138-person list plus any onward sharing can clear it in a
day. This is likelier to bite than most items on the security list.

### Revisit trigger — this one is NOT mechanical, and that is the point

Everything else in this file fires by itself. **This cannot**, because the threshold lives in
Vercel Analytics and the licence lives in an email. So it needs an owner and a date rather than a
test:

- **Before launch:** set a Vercel Analytics alert at **8,000 pageviews/month** — 80%, so the
  warning arrives with time to buy the next tier rather than after the breach.
- **At the alert:** Creative Market sells higher tiers; upgrading is cheap and retroactive
  purchase is not the same thing as having been licensed.
- **Owner:** Emil. Nobody else can see the account or the invoice.

Writing "monitor pageviews" without a number and an owner would be a control that cannot fire —
which this branch has spent a week removing. The 8,000 figure and the named owner are what make
this an obligation rather than a note.

### What it unblocks

The licence permits self-hosting, which is what [HANDOFF-sec.md §2a](HANDOFF-sec.md) needs. Until
the fonts are local the site still `@import`s four families from `fonts.googleapis.com`, sending
every visitor's IP and User-Agent to Google — a transfer the privacy policy currently has to
disclose. When UX lands local fonts, three things change together and should ship in one commit:

1. CSP tightens from `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src
   'self' https://fonts.gstatic.com` to `style-src 'self' 'unsafe-inline'; font-src 'self'`.
2. The **Fonts** section of `public/privacy.html` comes out — it currently promises exactly this
   move, so leaving it in after the fact makes the policy inaccurate in the other direction.
3. `src/zuca-gate-v4.jsx:111` loses the `@import`.
