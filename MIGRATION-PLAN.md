# Migration: Postgres as the write target, the Sheet as a mirror

**Scoping document, 2026-08-25. No code written. Nothing started.**

---

## Why, stated precisely

Version 5 shipped every optimisation available inside Apps Script:

```
                serialised calls        total calls
CREATE          11  →  4                11  →  11
UPDATE          37  →  8                37  →  15
```

Timeouts persist, two per signup. What remains is `SpreadsheetApp.openById()` on a 287×62
spreadsheet plus cold start, and **neither is addressable from that file.**

**The point of this migration is not that Postgres is faster.** It is that the Sheet stops being
on the request path at all. A write that takes 400ms and a write that takes 9 seconds are the same
to the visitor if neither of them is between them and their confirmation — the mirror runs after
the response, or on a schedule, and its slowness becomes an operational detail rather than a 500.

---

## What moves

| Today | After |
|---|---|
| Apps Script `doPost` create | `INSERT` from `/api/waitlist` |
| Apps Script `updateRow_` | `UPDATE` from `/api/waitlist` |
| Apps Script `confirmRow_` | `UPDATE` from `/api/confirm` |
| Apps Script `doGet` count | `SELECT count(*)`, or a cached counter |
| `ensureColumns_` | schema migration, once, in version control |
| `assertTargetSheet_` | a startup assertion against the DB schema |

**The consent rules move with them, and this is the part with real risk.** `LATE_CONSENTS`,
`IMMUTABLE`, the append-only transition logic and `mergeReceipt_` currently live in `Code.gs`
because it was the only layer that could read the existing row. Postgres can too, so they move to
the endpoint — but they must move **verbatim, with Scenario U moving with them.** Re-deriving
those rules from their description is exactly how the week's defects happened.

---

## What stays, and this is more than expected

**Upstash is untouched.** Rate limiting and the two-lifetime claim stay exactly as they are.
Claims are keyed on `seen:waitlist:<handle>`, the handle derivation does not change (D5 fixed it
as unkeyed SHA-256), so **all 156 committed keys survive the migration unchanged.** No re-keying,
no second remediation. If anyone proposes moving claims into Postgres "while we're here", the
answer is no: it is unnecessary risk against a component that currently works.

**The frozen response contract is untouched.** `200/400/403/405/409/413/415/429/500`, `refused`,
`dropped`, `edit_token`, `session_expired`. **This is a backend-only migration and the client
needs no change.** If the client needs a change, the migration has gone wrong.

**Edit and confirm tokens are untouched** — stateless HMACs over the handle, nothing stored.

**`sanitizeCell_` does not go away.** ⚠️ The obvious reasoning — *a database does not evaluate
formulas, so formula injection is not a threat* — is true and leads to the wrong conclusion. **The
mirror still writes to Sheets**, so a `=IMPORTXML(...)` stored cleanly in Postgres becomes a live
formula the moment it is mirrored. Sanitisation moves to the mirror writer. Dropping it would
reintroduce S2 by a new route, and it would look like a simplification.

---

## Schema

**One wide table, mirroring `COLUMNS` 1:1.** Not JSONB for the profile answers, despite that being
tidier.

The reason is this codebase's history: every defect this month has been a seam between two
representations of the same fact. A JSONB split introduces a new mapping layer between the schema,
the table and the mirror — three places a field can be forgotten. A wide table keeps the existing
mental model and lets `security:columns` keep deriving from one list.

Typed where it matters: `text` for identifiers, `boolean` for consents, `timestamptz` for the
moments, `jsonb` for `consent_receipt` only (it is already JSON and gains query-ability for free).

**Constraints worth having that the sheet cannot express:**

- `email_handle` UNIQUE — makes double-insert impossible at the storage layer, not just at the
  claim layer. Today two concurrent creates are prevented only by the script lock.
- `NOT NULL` on `email`, `consent_marketing`, `consent_text_version`, `consent_timestamp`
- a CHECK that consent version fields are present whenever their flag is true

That last one is the append-only consent rule expressed as a constraint rather than as code —
worth doing *in addition to* the code, not instead of it.

---

## The 156 claim keys and the 287 existing rows

**Claim keys: nothing happens to them.** Stated again because it is the question that was asked.

**Existing rows: one import, and it fixes a known blind spot.**

The remediation on 25 Aug could not match 130 rows because they have no `email_handle` — they are
the legacy old-modal population. At import we hold their addresses, so **their handles get
backfilled**, and the blind spot that made population B uncertain closes permanently.

That raises one decision: those 130 have never had a claim key, so nothing stops them signing up
again and creating a duplicate. **Recommend minting `committed` claims for them at import.** It
gives the original members the duplicate protection they never had, it is cheap, and it is
reversible.

---

## Cutover

**Big-bang with a short freeze. Not dual-write.**

Dual-write is the obvious "safe" choice and it is the wrong one here: two write paths that must
agree is precisely the shape of every defect this month. A freeze on a waitlist taking a handful
of signups a day costs almost nothing.

```
1.  schema created, empty, EU region
2.  import 287 rows, handles backfilled, claims minted
3.  VERIFY: row count, spot-check consent receipts, confirm every handle
    in Upstash resolves to a row
4.  deploy the endpoint writing to Postgres
5.  DELTA IMPORT anything that landed in the Sheet between 2 and 4, by
    timestamp — the window is minutes but it is not zero
6.  verify the delta, then the Sheet stops being written by Apps Script
7.  mirror job starts
8.  Apps Script deployment stays live but idle for one week, then archived
```

**Step 5 is the one that gets forgotten.** A signup during the deploy window lands in the Sheet
and exists nowhere else.

### What breaks during cutover

| | |
|---|---|
| Signups during the freeze | 500, and the claim lapses in 90s so they can retry — the S25 fix already covers this |
| In-flight step 2–4 saves | an update arriving after the flip finds no row in Postgres until the import completes. **Keep the freeze inside one 90s claim window** and this is invisible |
| `/api/count` | switches source; a stale cached number for one TTL |
| Edit / confirm tokens | unaffected |
| The client | unaffected |

---

## What changes for you, operationally

**The Sheet becomes read-only in effect.** This is the biggest behavioural change and it is not
technical.

Today you delete test rows in the Sheet and they are gone. Under a mirror, **deleting a row in the
Sheet does nothing to the data and the row reappears at the next sync.** Deletions have to happen
in the database.

Options, and this needs your answer before anything is built:

1. **Mirror overwrites** — simplest, and Sheet edits are silently reverted.
2. **Mirror appends only** — Sheet edits survive, but the two drift and neither is trustworthy.
3. **A small admin path** for deletions and corrections, Sheet stays a pure view.

**Recommend 1 plus a banner row in the Sheet saying it is a mirror**, with 3 added later if you
find yourself needing it. 2 is the worst of both.

---

## Database choice

**Postgres, EU region.** Vercel Postgres (Neon) is the least new infrastructure — same dashboard,
same env-var mechanism, and a connection pooler suited to serverless.

**This is a GDPR improvement, not a new problem.** Today rows sit in Google Sheets on US
infrastructure under the EU–US Data Privacy Framework. An EU-region Postgres removes the transfer
question entirely, which is what the Upstash EU-region note already argued for. Privacy policy and
the processor list need updating; the retention section does not change.

---

## Effort, honestly

| | |
|---|---|
| Schema + migration script | half a day |
| Move create/update/confirm/count off Apps Script | one day |
| Move the consent rules verbatim, with Scenario U | half a day, and it is the risky half |
| Mirror job + sanitisation | half a day |
| Import, verification, cutover | half a day |

**Two to three days**, and the third day is verification rather than code.

---

## What I want decided before I start

1. **Postgres provider and region** — Vercel Postgres EU unless you prefer otherwise.
2. **Mirror behaviour** — option 1, 2 or 3 above. This is the one that changes your daily habits.
3. **Mint claims for the 130 legacy rows?** — recommend yes.
4. **Freeze window** — a quiet hour, and who is watching.
5. **Whether the Sheet keeps every column** or the mirror is a readable subset. Sixty-two columns
   is not a thing anyone reads across; a mirror could show the fifteen that matter.

---

## What would make me say don't do this

If signup volume were falling rather than rising, the honest advice would be to leave it: two
timeouts per signup that the claim fix already recovers from is ugly but not fatal, and nobody is
being locked out. **The case for migrating is that it gets worse with every row** — `openById`
scales with the sheet — and that the failure mode is invisible to the person signing up.

It is not urgent. It is inevitable.
