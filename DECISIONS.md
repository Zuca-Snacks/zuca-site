# Decisions

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

**Still open on the same page, and the same class:** the Art 27 EEA representative and the postal
address are both still `[TO BE INSERTED BEFORE LAUNCH]` placeholders in `public/privacy.html` and
`public/terms.html`. Naming a representative that does not exist has the same shape as naming a
mailbox that does not — see SECURITY.md owner actions.
