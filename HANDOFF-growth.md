# HANDOFF — Conversion / Growth agent (`growth/waitlist-conversion`)

## Dependencies added

**None.** No new package was installed. `package.json` is untouched, so there is
nothing to resolve on merge.

---

## → For the UI/UX agent (`ux/mobile-redesign`)

### 1. Primitives I need from `src/components/ui/`

`src/components/ui/` did not exist on my branch, so I built the minimum unstyled
versions in **`src/components/waitlist/primitives.jsx`**, on tokens only. I
deliberately did *not* create files under `src/components/ui/`, so our branches
cannot collide. Swapping to your real primitives is an import change in four
files. The prop API I depend on:

| Primitive | Props I pass |
|---|---|
| `Button` | `type`, `variant: "primary" \| "secondary" \| "ghost"`, `disabled`, `busy`, `busyLabel`, `onClick`, `children` |
| `Input` | `id`, `label`, `type`, `inputMode`, `autoComplete`, `enterKeyHint`, `maxLength`, `placeholder`, `value`, `disabled`, `onChange`, `onFocus`, `error`, `errorId`, `ref` |
| `Field` | `error`, `errorId`, `children` — **must always render the error slot**, even when empty, or an appearing error shifts the layout |
| `ChipRadioGroup` | `legend`, `name`, `options: [{value,label}]`, `value`, `onChange`, `hint` |
| `ChipMultiGroup` | `legend`, `options`, `values`, `onChange`, `max`, `hint`, `disabled` |
| `Consent` | `id`, `checked`, `onChange`, `separate`, `describedBy`, `children` |
| `Accordion` | Not used — the FAQ is native `<details>/<summary>`. Zero JS, keyboard-complete, no shift on open. Restyle `.zc-faq` rather than replacing it, unless you need something it can't do. |

Chips must keep a **≥44px tap target in both axes** and `aria-pressed` /
`aria-checked` for their selected state — the styling hangs off those attributes.

### 2. Delete `src/components/waitlist/tokens.fallback.css` when you merge

It carries the starting token values from `AGENTS_BRIEF.md` so this branch can
run standalone. It sits inside `@layer zuca-token-fallback`, which loses to any
unlayered rule, so **your `src/styles/tokens.css` wins automatically** the moment
it exists — no specificity fight, nothing to un-wire. Delete the file and its two
`@import` lines (`waitlist.css`, `content/sections.css`) at your convenience.

**This is the only file on my branch containing a hex value.** Everything else is
`var(--z-*)`.

### 3. Token-role inversion for dark surfaces

The hero and footer sit on a dark ground while the tokens are a light palette. I
added `.zc-invert` in `src/components/content/sections.css`, which remaps
`--z-ink → --z-surface`, `--z-ink-muted → --z-surface-alt`, `--z-brand →
--z-warm` for that subtree. No new values. **Keep the waitlist form outside any
`.zc-invert` wrapper** — it is a light card and needs the tokens the right way up.

If you introduce a proper inverted-surface convention, replace `.zc-invert` with
it and I'll follow.

### 4. Sections I built that are really yours

`src/components/content/sections.jsx` + `sections.css` — `ProofStrip`,
`NumberBlock`, `Faq`. These are minimum viable structures so the rewritten copy
could ship. Absorb or restyle them freely; **all copy comes from
`src/content/copy.js`, so restyling never touches wording.**

### 5. The intro gate is yours to remove

Decision (Emil, 15 Aug): **the gate goes away for everyone** — no conditional
skip — and the ZUCA logo moment folds into the hero as a fast, non-blocking
entrance. One behaviour, no branching.

I had briefly shipped a UTM-based skip. **It is now removed**: `zuca-gate-v4.jsx`
is back to the unconditional gate, and no growth code branches on campaign
traffic. UTM *capture* is untouched — `page_view` still carries a `campaign`
flag, and every payload still carries the contract's `utm` object.

Two consequences for you:

- **On my branch alone the gate is still there.** Merge order is UX →
  Conversion → Security, so your removal lands first and mine inherits it.
  Nothing in my code depends on `page-a`, `veil`, or `productIn` existing.
- `introLines` in `src/content/copy.js` holds the three claim-safe tagline lines
  (the old ones said "the snack brand that **clinicians recommend**" — not
  usable). If the hero entrance reuses a tagline, take it from there. If nothing
  uses it, tell me and I'll delete the export.

### 5b. Button variants — --z-cta scope

Settled (Emil, 18 Aug): **green `--z-cta` for forward/submit actions, neutral
ghost for Back and Skip, red stays brand identity only.** Progress completed
segments go green.

My side is pointed correctly and needs nothing further once you repoint
`--btn-bg`:

| Control | Variant | Why |
|---|---|---|
| Step 1 submit, Continue, Done | `primary` | forward actions — these carry `--z-cta` |
| Back | `ghost` | a retreat, not a forward action. Was `secondary`; changed. |
| Skip | `ghost` | unchanged — a visible skip must not compete with the CTA |
| Share (confirmation) | `secondary` | neither forward-in-flow nor a retreat; tell me if you want it green |

Two things that live in your files, not mine:

- **`ui.css:11` — `--btn-bg: var(--z-accent)`.** That single line is the
  repoint. Adding `--z-cta` without changing it has no visible effect.
- **`.z-progress__seg[data-state='done']` is on `--z-accent`.** If buttons go
  green and this stays red, the form shows two different "active" colours in
  one card. Per the ruling it should follow `--z-cta`.

### 6. Layout bugs I found but did not fix (yours)

- **`.nav-strip` collides at 390px.** "ZUCA" and "Waitlist open" overlap — see
  `docs/screenshots/01-hero-390-above-fold.png`, top of frame. Pre-existing; the
  text length is unchanged from "Pre-order open".
- **`html, body { cursor: none }`** hides the system cursor site-wide for the
  custom cursor. Inside a form, people need to see where they are typing, so I
  set `cursor: auto` on `.zw` and `.zc` and `cursor: pointer` on my controls.
  If you rework the cursor, keep that carve-out.
- **`.hero-left` padding is `80px 32px` at ≤900px.** That top padding is what
  pushes the form down; if you tighten it, step 1 moves further above the fold.

---

## 🪜 THE LADDER HAS A FLOOR — and that is what makes a hand-maintained list safe

Rungs 1 and 2 strip **keys**. They cannot fix a bad **value** in a key the
server keeps: a retired enum member in `price_band` 400s at CORE exactly as it
does at full. So there is a third rung, `MINIMAL_KEYS` — email, consent, and
the consent version, which is what the server actually requires and nothing
more.

**Losing every answer is bad. Losing the email is the failure the endpoint
exists to prevent.** The floor guarantees a version of the record that
validates against any schema we have not seen yet.

### Why this closes the SERVER_KNOWN_KEYS worry rather than deferring it

The standing objection was that `SERVER_KNOWN_KEYS` is hand-maintained, and a
hand-maintained list drifts — and drifting *optimistic* (claiming the server
accepts something it rejects) was unrecoverable, because rung 1 would strip
nothing and the retry would fail identically.

With a floor, that is no longer true. An optimistic list now costs one wasted
round trip instead of the submission. The list is still worth keeping accurate,
but **being wrong about it can no longer lose a signup** — which was the actual
risk, not the inaccuracy itself.

The ladder also skips any rung that would drop nothing. Stopping at a no-op
rung was the bug that made the floor unreachable in the first place: "nothing
left to strip" was being treated as "nothing left to try".

### A queued payload outlives the schema it was written against

**"The client stopped sending that value" is not "nothing will send it
again".** An entry sitting in `localStorage` from before an enum change still
carries the retired member. On replay it 400s — and before the floor existed it
was *dequeued rather than retried*, losing the email silently.

Two consequences:

1. **Any future REMOVE has to wait out the queue, not just the deploy.** The
   client-first rule assumes the client stops sending immediately; a queue
   breaks that assumption.
2. Entries now carry `meta.schema` (`SCHEMA_GENERATION`), so a stale replay is
   *recognisable* rather than merely unlucky. Bump it whenever an enum member
   is retired. It gates nothing — the floor already handles survival — it makes
   the event legible in telemetry instead of anonymous.

Zero exposure so far: the queue has never run in production. That is exactly
why it was worth fixing now.

---

## 🔁 ENUM CHANGE ORDERING (now in AGENTS_BRIEF.md)

  ADDING a value:            server first, then client
  REMOVING a value or field: client first, then server

**The asymmetry is the whole rule.** Adding is safe server-first because a
server tolerates a value nobody sends yet. Removing is safe client-first for the
mirror reason: a server still accepts a value nobody sends any more.

Get either backwards and you get a 400 that **the downgrade ladder cannot
recover**. The ladder strips unknown *keys*; this is a known key carrying an
unknown *value*, and `motivation` is a CORE field, so there is no rung left to
fall to. The whole submission is lost, not the field.

Security added the half I had not thought of, and it is the half that makes the
rule load-bearing rather than tidy: **the endpoint deliberately refuses to name
the failing field**, because a 400 saying "bad motivation value" is an
enumeration oracle. So the opacity that protects the schema is exactly why the
ordering has to be written down instead of discovered while debugging. It will
not become chattier. The rule is the compensation.

Practical version when changing an enum: land the server side, confirm it is
deployed, add the value client-side, then re-verify against the named commit —
never against a description of it.

---

## 📊 WATCH: DOES `price_band_other` COME IN BELOW THE FLOOR?

"Under $24" was dropped on instruction, and dropping the bottom band **raises
the anchor**. Someone who would pay $20 can no longer say so with a chip — they
have to reach for "Something else" and type it.

**So the free-text field is now a test of the band set, not just an escape
hatch.** Watch how often `price_band_other` resolves to a figure below the
lowest band:

| Pattern | Reading |
|---|---|
| Rare, and mostly ranges/qualifiers ("$25-30 depends on size") | Bands are right; Other is doing its normal job. |
| **Frequently below $25** | **The band set is wrong, not the respondents.** The floor was cut too high and every one of those people was pushed into free text to say a thing a chip should have captured. |

If the second pattern shows, the fix is to restore a bottom band — not to
reinterpret the answers upward.

**Do not parse `price_band_other` into a number.** It is stored verbatim on
purpose: "£30ish", "$25-30" and "depends on the size" are all real answers, and
a figure extracted from any of them is a guess wearing data's clothes. Read it
by eye, in bulk, and let it tell you whether the chips were wrong.

Capped at 40 to match the server exactly. Not 16 — "$25-30 depends on size" is
22 characters and is a real answer — and not 120, which invites prose into a
field that should hold a figure.

---

## 📉 WATCH THE AVERAGE SELECTION COUNT

The max-3 / max-2 caps are gone from every multi-select (motivation, dietary,
channel) at Emil's instruction: if someone has four reasons, take four.

**Unlimited selection weakens the signal, and that is a real cost, not a
quibble.** A cap forces a ranking — picking 3 from 8 says *these matter most*.
Without one, the person who ticks everything and the person who ticks two are
recorded the same way, and the first tells you almost nothing: if 70% of the
list selects "gut health", that is only useful if selecting it meant choosing it
over something else.

**So watch it once traffic arrives.** `step2_submit` already carries
`motivation_count`; the number to watch is the **mean selections per respondent
per field**.

| Mean | Reading |
|---|---|
| ~2–3 | Working as intended. People are choosing. |
| ~4–5 | Weakening. Cross-tabs get muddy. |
| >5, or a large share selecting *everything* | The field has stopped discriminating. Treat it as "interested in fiber" and nothing finer. |

If it drifts high, the fix is **not** to reinstate a hard cap — that re-opens
the truncation problem and annoys people mid-form. Better options, in order:
ask for a single *primary* reason alongside the multi-select; or rank the top
two; or leave collection alone and weight the analysis by 1/n selections, so
someone who picked six contributes a sixth of a vote each.

Note the server now bounds each list by the number of distinct valid values, so
"uncapped" is bounded by the enum and de-duplicated — there is no unbounded
growth to defend against, only signal dilution.

---

## 📧 THE REPO IS PUBLIC, SO EVERY EXAMPLE ADDRESS IS A PUBLISHED ONE

Confirmed rather than assumed — `gh repo view` reports `Zuca-Snacks/zuca-site`
as **PUBLIC**. That changes what an illustrative address is: not a placeholder,
but a string committed to a scrapeable public tree, pointing at whoever owns the
domain.

Everything here now uses RFC 2606 reserved names — `example.com`, or a `.example`
TLD where the fiction needs to read as a real business:

⚠️ The table below names DOMAINS and never forms an address, on purpose. The
first draft of this section listed each bad address in full while explaining why
it was wrong — reintroducing all six into the public tree inside the fix for
them, one of them a real person's name at a live mail host. **Documenting a bad
address tends to mean printing it.** Security hit the same thing in the same
hour and it is the reason this reads the way it does.

| was at | now | where |
|---|---|---|
| `zuca.com` | `example.com` | `src/lib/validation.js` — shipped source |
| a live mail host, with a person's name | `example.com` | `src/content/copy.js` — shipped source |
| `bakeriet.no` | `bakeriet.example` | tests and this handoff, six places |
| `b.com`, `b.co` | `example.com` | tests — both registered |

**And the strings survive in git history regardless.** These were committed and
pushed before the sweep, so they are in the public log whatever this file says.
Rewriting that history would mean a force-push, which is prohibited here and
would be the wrong trade anyway: a rewritten public branch breaks every clone for
a string already scraped. The remedy for anything genuinely sensitive is to
change the thing, not the record of it.

**`mailinator.com` stays, deliberately.** The disposable-domain test has to name a
real disposable provider or it tests nothing — the string IS the thing under
test, which is the same exemption-by-scope that keeps security's
`admin@zucasnacks.com` role-address fixture where it is.

The rule, since it is not obvious from any single instance: **an example address
belongs at a reserved domain unless the specific domain is what is being
tested.** `.co` and `.no` are live TLDs and do not qualify; `.example`, `.test`,
`.invalid` and `example.com/net/org` do.

## 🏢 THE OFFICE PATH REJECTS OFFICE ADDRESSES (S22 — BUILT AND LIVE)

Two things we built are in direct conflict, and neither team could see it alone.

Step 2 asks **"Would you want these as an office snack?"** and then collects a
company name and headcount. The server's `ROLE_LOCALPARTS` rejects the address a
small company actually uses:

```
office@bakeriet.example    REJECTED   role_address
team@ · contact@ · info@ · sales@   REJECTED
post@bakeriet.example      OK   ← the standard Norwegian business prefix
emil@bakeriet.example      OK
```

Setting `office_interest`, `company` and `headcount` does not help: the address
is rejected before any of them is read. **We invite someone to tell us about
their workplace and then refuse the workplace address**, and the arbitrariness
is visible to anyone who tries twice — `post@` works, `office@` does not.

The blocklist is not wrong. It exists because a shared mailbox is a bad
marketing contact. The conflict is that we later built a path where a shared
mailbox is exactly the right contact.

### If Emil takes it, the consent wording is ours — draft ready

**A shared mailbox cannot give Art 7(1) consent as an individual.** We cannot
demonstrate *who* agreed, and the person who eventually reads the mail may never
have seen the form. So these rows need a different basis and different wording —
not the personal marketing consent with a wider blocklist.

Draft, to be reviewed rather than shipped as-is:

> **"I'm asking on behalf of my workplace."**
> This is a business enquiry, not a personal signup. We'll email this address
> about stocking Zuca at work — nothing else — and **anyone reading this inbox
> can stop it by replying to that email**. Because it's a shared address, we
> won't add it to our personal mailing list.

Three things that wording is doing deliberately:

1. **Names it as a business enquiry**, so the basis is business contact rather
   than personal consent.
2. **Narrows the purpose to the office conversation.** The reason a shared
   mailbox is a bad marketing contact is that consent cannot follow the person;
   narrowing the purpose is what makes it defensible.
3. **States the exclusion out loud** — these rows never join the personal send
   list. Security's recommendation is to flag the row; the promise should be
   visible to the person, not only enforced in the sheet.

**"Anyone reading this inbox"** rather than "you", on security's point: with a
shared mailbox, the person who wants it stopped is often not the person who
signed up. An opt-out only the original sender can exercise is not an opt-out
for a shared address.

### The narrowing is a constraint on us, not a courtesy

Worth stating beside the wording so nobody later reads these as a general list
with a note attached: **a mailbox nobody personally consented from can only
support a purpose that is genuinely about the organisation.** The moment we mail
`office@` about a consumer launch, the basis evaporates — not weakens, evaporates,
because the only thing making it lawful was that the enquiry was the company's.

So the exclusion is not a preference we could revisit when the list looks thin.
It is the condition the wording is standing on.

It would mint its own version id (`biz-…`) through the existing fingerprint, so
the evidence trail works unchanged.

**BUILT.** Emil approved it on 2026-08-19; server landed at `sec@02d148b`,
client here. What follows is what the build taught that the draft above did not
know.

### The gate could not be `office_interest`, and the reason is pure sequencing

Security's recommendation was to allow a role address when `office_interest` is
set. It cannot work, and it is worth writing down because both sides read it
twice without seeing it:

```
step 1, screen 0    email submitted and validated   ← role_address rejected HERE
step 2, screen 4    office_interest / company / headcount   ← two screens later
```

The address is refused before the person has any way to say it is a work
enquiry. The gate is a dedicated `business_enquiry` flag plus a consent version,
tested the same way the medication gate is: against the **resolved wording**, not
against the flag. Security accepted the correction and rebuilt it that way.

### The 400 says nothing, so the offer is client-side — like the double-dot typo

`{ ok: false, error: 'validation' }`. No path, no rule. That is deliberate
(anti-enumeration, `api/waitlist.js:17`) and should stay. Security's note said
"the path stays `['email']` with rule `role_address` so your client copy keeps
working" — true inside their validator, invisible from here. **The rule name goes
to their audit log, not to us.** Same discovery as the double-dot typo, same
remedy: decide it on our side.

So `roleAddress.js` mirrors `ROLE_LOCALPARTS` — **and I refused to mirror that
same list a fortnight ago.** The difference is what the copy is allowed to do:

| used for | stale copy fails… | verdict |
|---|---|---|
| pre-validation (refused) | optimistically — waves through what the server refuses | unsafe |
| deciding what to OFFER (built) | either way, harmlessly — server still decides | safe |

A mirror that grants nothing cannot be wrong in the direction that matters. If
that file ever gains a caller that returns early, it has silently become
pre-validation — there is a test asserting it has not.

Drift is caught rather than merely tolerated: **any** step-1 validation failure
offers the box, whatever our list says. `BUSINESS_OFFERED` records `via` —
a rising `rejected` share against `local_part` means their list has moved and
ours has not, which is otherwise invisible from here.

### ⚠️ THE LADDER WOULD HAVE GUARANTEED THE FAILURE IT EXISTS TO PREVENT

The one that would have shipped silently. `business_enquiry` reads like optional
metadata, so it belonged in `SERVER_KNOWN_KEYS` and nowhere else. Verified
against their real schema:

```
CORE (without the fix)      rejected  email:role_address
MINIMAL (without the fix)   rejected  email:role_address
```

Every rung strips the field that made the address legal, so a business signup
that hit any 400 would descend the ladder failing identically at each step and
die at the floor. **For a shared inbox these keys are not data, they are the
precondition of the address being accepted** — so they are in CORE and MINIMAL.

It also narrows the floor's promise, and the test now says so: *"there is always
a version of the record that validates"* holds only for an address the server
would accept at all. A role address with an unregistered consent id has no valid
form — keep the keys and it fails on the wording, drop them and it fails on
`role_address`. Correct, but no longer unconditional.

### The wording is authored here, and that is not a formality

Security hand-registered `2026-08-19.business.a` — the single hand-maintained
entry in a registry whose generator exists precisely to prevent them — and in
doing so rewrote Emil's approved text into the third person ("Zuca will email"
for "We'll email"). Two problems, one structural:

- **display ≠ stored.** Rendering Emil's words while sending their id records a
  consent the person never read. That is the defect class the fingerprint was
  built to make impossible.
- the wording stops living in `copy.js`, so the next edit changes what people
  see without changing the evidence.

So it is authored in `consentTexts.business` and minted the normal way:
**`biz-eea-2026-08-19-fc6ba471`**. Region token `eea` for the same reason `mot`
uses it — one wording at the strict bar, and `all` parses as `unknown` regime.

`BUSINESS_BASIS_LIVE = true` since `sec@6efe051`, which registered it via the
generator and corrected the wording back to Emil's words — verified
byte-identical, and both texts fingerprint to the same id.

The registry is gitignored and rebuilt by their `npm run build`, so it cannot
go stale: edit the wording and the id, the registration and the gate all move
together. Confirmed by running their generator against this repo's copy.js —
it emits exactly the id this client mints.

### ⚠️ `.strict()` REJECTS ON KEY PRESENCE, NOT ON VALUE — the ordering rule's missing half

The rule says ADD goes server-first. Its unstated second half is that **the
client must not emit the key until the server carrying it is deployed.** The
window between two deploys is not "the new field is ignored" — it is
`Unrecognized key` and a 400 on *every* submission. Measured against
`sec@8d6bf01`, the real pre-S22 schema, with this client's actual payloads:

```
personal signup, keys omitted           ACCEPTED   ← what we ship
same payload + business_enquiry: false  REJECTED   Unrecognized keys
```

One key, value `false`, nobody ticking anything: a working form versus a total
outage for everyone. Which is why both business keys are **omitted entirely
unless the box is ticked** — an ordinary signup is byte-identical to what
shipped before S22, so an old server accepts it and only the office path
degrades.

It also compounds with the ladder fix. The keys are in CORE and MINIMAL, so
against an old server the retry cannot strip its way out: it fails identically
at every rung and burns three round trips doing it. Correct for a current
server, useless against a stale one — the floor cannot rescue a key the server
has never heard of.

`test/failure-paths.test.mjs` pins the unconditional key list for this reason.
A new always-present key fails that test, which is the moment to ask whether
its server is deployed yet.

**And a second test pins the conditional pair, because the first one cannot see
them.** A test that builds the default payload never constructs the keys that
only appear on a branch — so renaming `business_enquiry` to `businessEnquiry`
passed the entire suite silently. Found by mutation, not by reading, after
security hit the identical blindness in `security:compat`: its extractor read
only flat keys and reported COMPATIBLE while missing exactly the two newest
fields. Conditional keys are the newest and most drift-prone in any payload and
they are precisely the ones a default-path test never reaches.

The drift is not hypothetical: camelCase is this codebase's natural style and
snake_case is the deliberate exception for wire keys, so `businessEnquiry` is
the single likeliest key mistake here — and `.strict()` would reject the whole
payload for it.

**A guard cannot be reviewed into correctness. Break it deliberately and watch
whether it notices.** Four mutations were run against this suite; one passed.

### `npm run mutate` — fifteen plausible defects, ~75s, non-zero on survival

I proposed doing that by hand whenever a field is added. Security's answer was
better and it is now a script on both sides: forty seconds is cheap enough to do
and **exactly expensive enough to skip**, and a ritual that depends on
remembering is not a control — it is the NEVER_WRITTEN mistake in process
clothes.

Two rules in the harness that are not decoration, both verified by breaking them:

- **The negative control runs first.** A suite that failed on everything would
  "catch" every mutation and be worthless. Observed firing for real on the first
  run, when the harness was invoking a different command than `npm test` — which
  would have reported nine green mutations about tests nobody executes.
- **A mutation that does not APPLY counts as a failure.** If a pattern stops
  matching, the code moved and that mutation silently tests nothing. That is the
  precise failure this file exists to catch, so it does not get to happen inside
  it.

**The ninth mutation found a live blindness in a legally load-bearing test.**
The wording assertion was an alternation, so replacing *"I'm asking on behalf of
my workplace"* with *"I'd like to hear from you"* still matched a phrase further
down — and passed security's server gate too. That would leave a shared mailbox
signed up on a sentence asserting nothing about the organisation, which is the
only thing making it lawful. Each load-bearing element is now asserted
separately: the basis, the naming, the stop mechanism, the exclusion.

Security tightened their gate to a conjunction and deliberately did **not**
mirror my four elements — a legitimate rephrasing should not become a server
rejection. Stricter where the words are authored, looser where they are
verified. That asymmetry is correct and is now the settled position.

### 🌍 THE CONSENT GATES ARE ENGLISH, AND THAT IS A PRODUCT DECISION

Security raised this and it belongs on the copy side. Two wordings —
`business` and `motivation` — are gated on their TEXT rather than on a flag,
because checking that the sentence actually says the thing is what makes the
evidence mean anything. The consequence:

```
"Jeg spør på vegne av arbeidsplassen min…"   refused — basis, exclusion, stop
```

It fails closed, so nothing unlawful is stored. But from a translator's seat
the office path and the health opt-in just stop working, with a rejection
naming a rule they cannot find in the copy they wrote. **It is not fixable with
a better regex** — a gate that checks a sentence says specific things is
language-bound by construction.

If a second language is coming, it is a decision before it is an edit: a
per-language element list on the server, or a structured claim the copy declares
alongside its text. A test fails the moment either wording is translated, so the
question gets asked at the keyboard rather than after launch.

**Emil has not been asked whether localisation is on the roadmap.** Nobody
should infer from this note that it is.

### ⚠️ A TRANSCRIBED PATTERN WENT STALE INSIDE ONE EXCHANGE

The test above transcribes security's gate regexes rather than importing them —
a deliberate trade, since importing would make this suite depend on their
worktree sitting beside ours. The cost of that trade showed up immediately.

The first version copied `consentCoversBusiness`, a single alternation, **which
had already been replaced by a three-element conjunction in the message before
I wrote it.** I copied from my earlier reading of their file instead of
re-reading the file. Their basis pattern had also narrowed, `\bworkplace\b` to
`\bmy workplace\b` — so a wording could have passed this test and been refused
by the server, which is precisely the gap the test exists to close.

Nothing shipped wrong: our wording satisfies both the old and the new gate,
verified by running their real `businessConsentGaps()` against it (`[]`, no
gaps). But the failure was live for the length of one commit and would not have
been found by reading either file.

Security now pins their gate patterns by fingerprint and fails their suite if
they change, so the obligation to tell us is a test rather than a promise. **The
rule this leaves: a test holding its own copy of the thing it checks has stopped
checking it** — and re-read the source, never your last reading of it.

### ⚠️ A LOOP OVER A LIST MEASURES THE LIST, NOT THE WORLD

Security found this in their seam test and I went looking rather than agreeing
there would be one. **Two, both in checks I had written this week.**

The gated-wording test iterated a `GATES` array with nothing asserting what was
in it. Deleting rows passed 28/28 in silence — **including the `motivation` row,
the only check on the Art 9 health consent wording.** "5 gates, all matched" and
"3 gates, all matched" print the same word. Zero was never the risk; *fewer than
you think* is. Coverage is now declared separately from the data iterated.

The `sendBeacon` scan was worse, because it was a coverage gap and not merely a
structural one: it read `src/components/waitlist/` and therefore never looked at
`src/lib/analytics.js` — **the single most likely place anyone would reach for
`sendBeacon`**, since firing an event on unload is its textbook use. A scan that
finds nothing and a scan that looked nowhere both print "no hits". It now walks
all of `src/`, asserts how many files it scanned, and asserts `analytics.js` is
among them. Verified by planting a `sendBeacon` call there.

**Any assertion inside a loop is an assertion about the fixture until something
floors the fixture.**

### AND A FLOOR HAS A CEILING — WHICH IS WORTH MEASURING BEFORE TRUSTING

`npm run mutate` had the same bug as everything it was written to catch:
deleting four mutations printed **`all 8 mutations caught`** and exited 0. The
harness built to find pass-on-nothing had pass-on-nothing. It now declares
`EXPECTED_MUTATIONS` and aborts on a mismatch.

Security's distinction is the one to keep: **where a second independent reading
exists, derive; where none does, declare a constant and say so rather than
dressing it up as a check.** The payload keys and the ladder key sets derive.
The gate element list and the mutation count cannot — the only second reading is
security's repo, and importing it would make this suite depend on their worktree
sitting beside ours.

**And the received wisdom about placement is wrong, which I only know because I
measured it.** Moving the gate floor far from the array it floors does *not*
prevent a same-motion edit: deleting a `GATES` row together with its label still
passes 28/28. Distance is a speed bump, not a control. It buys exactly one
thing — removing a gate stops being a single-line deletion — and both files now
state that ceiling instead of letting their placement imply a strength they do
not have.

### ⚠️ ASK WHAT THE MUTATIONS COVER, NOT ONLY WHETHER THEY PASS

`all 12 mutations caught` was reading as though it meant the suite worked. It
meant only that every mutation was noticed by *something*. Security asked the
other question first — which of the checks has ever been shown a failure — and
it found an unexercised category on their side immediately. It found one here
too.

**A mutation labelled `business keys dropped from the floor` had only ever
edited CORE.** Its pattern matched the first `business_enquiry…]);` in the file,
which is `CORE_KEYS`. So the mutation applied, was caught, reported green — and
`the floor is what the server actually requires` had never once been shown a
failure, despite the floor being the last rescue a role address has. **A
mutation can lie about what it does while passing.**

`npm run mutate` now reports which tests each mutation actually fails, and lists
the ones nothing has ever exercised. Three static assertions were in that list
and now are not:

- `the floor is what the server actually requires`
- `the shared-inbox mirror decides presentation, never permission` — a regex
  over `Step1Email.jsx` source, the same family as the `sendBeacon` scan
- `the business consent id keeps its purpose and region tokens`

The eighteen still unexercised are all behavioural: they stub a 404, a 413, an
offline fetch, and construct the failure they assert on. **Those are
self-exercising; a STATIC assertion in that list would be a gap** — a regex over
source or a pinned list passes forever if written wrong, and nothing else will
ever tell it so. The list is printed rather than floored with another constant,
because the useful output is which names are in it.

The near-miss worth recording: the first run of that experiment reported a
correct-looking failure, and the deletion had **not applied** — the floor's
indentation differed from my patch. It failed for the wrong reason and I nearly
wrote it up as a success. That is the did-not-apply rule from `mutate.mjs`,
biting the person who wrote it, by hand, minutes later.

**⚠️ THE ONE REMAINING DEPENDENCY IS DEPLOY ORDER.** The id resolves only where
both sides are present. A deploy carrying this client without `sec@6efe051`
offers the checkbox and then refuses the submission anyway. It fails closed —
no shared mailbox is stored without a basis — but to the person it is a dead
end, so the two merge together or not at all.

### The confirmation had to change too, or we would have lied on the last screen

The server stores `consent_marketing` FALSE for these rows regardless of what
the box said — correct, since a shared mailbox cannot carry a named person's
consent. But the confirmation promised *"We'll email you once before launch"*.
**That is now an email we have committed not to send**, so a business enquiry
gets `whatNextLineBusiness` instead. The suppression and the promise are the
same fact in two places; only one of them was in security's diff.


## ⚖️ FOR COOLEY REVIEW — two items, both added on instruction, neither to be assumed safe

Emil instructed both of these on 18 Aug 2026 and asked that counsel **bless them
explicitly rather than have us assume they are fine.** They are live on the
branch. This section exists so the review has the reasoning in front of it, not
just the strings.

### 1. The disease-reversal line — the highest-risk sentence on the site

Rendered in Kelley Yuan's credential list in the founders section:

> **"Reversed her own autoimmune disease through a plant-based diet"**

**Why it is the riskiest thing we publish.** It puts a disease outcome and a
product we sell on the same page, under the byline of the company's Chief
Medical Officer. Nothing in the sentence says Zuca did it — but the reader is
not reading sentences, they are reading a page, and the inference *"our CMO
reversed disease with food, and this is that food"* is one the reader supplies
for free if we let the two sit together. That inference is a health claim
whether or not we wrote it.

**The framing it depends on.** Its defensibility is entirely in how it is
written, so the wording is not editorial preference:

- **Past tense, first person, about her.** Something that happened to a named
  individual, not an outcome offered to a reader.
- **The agent is named, and it is not Zuca.** "through a plant-based diet" —
  a way of eating, not a product.
- **No condition is named.** "autoimmune disease" as a category, never a
  specific diagnosis.
- **It sits in a biography list**, under her photo and title, with no product
  statement inside the same block.

**What would break it**, and what we have therefore not done:
- moving it adjacent to any nutrient or product claim
- naming the condition
- rewriting it toward outcome language ("reversed disease with food")
- repeating it anywhere outside the founders section — it appears **once**

The code comment beside it in `src/content/copy.js` says the same thing, so
whoever edits next sees the constraint rather than a plain string.

### 2. The title "Founding CMO"

Kelley's title changed from "Physician & Co-Founder" to **"Founding CMO"**.

Worth reviewing **together with item 1, not separately** — they compound. A
Chief Medical Officer title on a food company asserts medical authority over the
product; the disease line asserts a medical outcome. Either alone is a narrower
question than both on one card, under one photo, three lines apart.

Specifically worth counsel's view: whether "CMO" on a food brand implies a
clinical role in formulation that we would then have to substantiate, given the
site also says she "leads Zuca's clinical network: 10+ physicians across 7
specialties."

### Context: what was removed at the same time

The backing line — *"Supported by Stanford's NEXT Accelerator. Regulatory
counsel provided pro bono by Cooley LLP. Manufactured with Step Change
Innovations."* — is gone from the founders section on Emil's instruction.

**I also removed the identical claim from the "Who's behind it?" FAQ answer**,
which he did not explicitly ask for. Reason: leaving a withdrawn claim standing
one section away is exactly how "130+ pre-orders" and "no added sugar" came
back. If he meant only the founders section, the FAQ sentence is a one-line
restore — flagging it rather than burying it.

Note the site therefore no longer names Cooley anywhere, which independently
removes any risk of implying FDA endorsement by association.

---

## ⚠️ ALLERGEN PANEL IS CONFIRMED BUT NOT STABLE

**Confirmed 18 Aug 2026:** both flavours contain tree nuts — almonds and pecans.
The site states exactly that and it is accurate today.

**It is expected to change.** The nut base may move from almond to **sunflower
butter**, with pecan remaining in Maple Pecan. That is not a copy edit when it
lands — it changes the *shape* of the claim:

| Today | If the base moves |
|---|---|
| One shared statement true of both flavours | Maple Pecan carries tree nuts; the other may not |
| Safe on shared pills, shared subheads, one FAQ line | Needs per-flavour allergen wording |

So: **do not build anything that assumes this panel is permanent.** Concretely,
nothing should hard-code "contains tree nuts" as a property of *Zuca* rather
than of a flavour — not the shared `PILLS` array, not a segment, not an email
cohort, not a filter. The places that would need to change are the `numbers`
footnote, the allergen FAQ, `Flavors.jsx` PILLS, and the og/twitter meta.

### ❌ Never claim gluten-free

Unconfirmed, and — this is the part that catches people — **a separate question
from the recipe.** A gluten-free recipe made on a shared line is not a
gluten-free product; that is a facility question, and we do not have the answer.

The `gluten_free` value in `fields.js` is a **dietary chip: the user describing
their own diet.** It is not evidence about Zuca and must never be read back as
one. If someone later builds a "gluten-free interest" segment, that is a segment
of *people*, not a claim about the product, and the copy must not blur the two.

Still unconfirmed and therefore unstated anywhere: dairy in Chocolate Raspberry
Sea Salt, and shared-facility cross-contact.

---

## 🧩 THE LESSON OF THE WEEK: VERIFY THE JOIN, NOT THE PARTS

Every serious failure this week had both sides individually correct and the
**seam between them** unverified. Not four lessons — one, four times:

| Component A | Component B | What broke |
|---|---|---|
| endpoint ✓ | Code.gs ✓ | the seam dropped `sms_phone` |
| client cap 120 ✓ | server cap 40 ✓ | the **gap between them** was a 400 |
| rung 1 ✓ | rung 2 ✓ | the **descent between them** was unreachable |
| `ui/OtherInput` ✓ | my call sites ✓ | `show` defaulted false — every box invisible |
| my `type` default ✓ | `ui/Button` ✓ | the swap changed the default; Back submitted |

In every case the parts passed their own tests. **A green component tells you
nothing about the join it participates in**, and joins are where the ownership
boundary sits — which is exactly why nobody's tests covered them.

### What this changes about how to check

- **Test the transition, not the states.** "Rung 1 ✓, rung 2 ✓" was true and
  useless: each was verified by handing it a pre-stripped payload, so the
  descent between them was never exercised. The bug was in the step.
- **Two correct numbers can still be a defect.** A client cap and a server cap
  are each defensible alone; only comparing them shows the 41–120 dead zone.
  When two layers hold the same constant, assert they are EQUAL, not that each
  is reasonable.
- **When adopting someone else's component, re-derive what your assertions
  mean.** Not whether they pass — what they *mean*. `count() > 0` meant
  "usable" against my stand-in and "rendered but inert" against UX's, and it
  passed identically both times.

### The corollary that nearly bit here

A fix that makes failure survivable can also make it invisible. The downgrade
floor rescues the email — and had it landed as a *bare* email, it would have
traded a loud loss for a quiet one, which is the worse trade.

It does not: `downgraded_fields` is populated at every rung including the
floor, so a rescued record declares itself and names what it lost. Two tests
lock that, including one asserting the floor still names a field dropped at an
*earlier* rung. **When you make something fail softer, check what it stopped
announcing.**

---

## ⚠️ RULE: assert on visibility, never on presence

**For anything gated on a prop, assert that it is visible and interactable. A
DOM-presence check is not a test — it is a test-shaped thing that passes while
the feature is broken.**

This is not a general principle someone thought was nice. It is written here
because it already cost us every free-text box on the form, silently, across
multiple rounds of checking that all reported green.

### What happened

`src/components/waitlist/primitives.jsx` (mine, now deleted) rendered
`OtherInput` **conditionally** — if the "Other" chip was selected, the element
existed; otherwise it did not. So "is it in the DOM" and "can the user use it"
were the same question, and a `count() > 0` assertion was a fair proxy.

`src/components/ui/OtherInput.jsx` (UX's, now in use) is **always rendered** and
toggled by a `show` prop, defaulting to `false`, with `inert={!show}`. It does
this deliberately and correctly: it reserves its own gap so revealing it cannot
shift a chip out from under a thumb already moving toward it.

The swap changed the meaning of presence, and nothing announced that. `show` was
never passed, so from the moment of the swap **every free-text box on the form
was rendered, invisible, and inert. No user could type in any of them.**

### What did not catch it

- `eslint` — green. It is not a missing prop; the default is legal.
- `vite build` — green. It compiles perfectly.
- Browser tests asserting `locator(...).count() > 0` — **green, and reported as
  "appears ✓" in a handoff.** The element was genuinely there.
- Reading the diff. The swap looks like an import change.

It was found only by chasing an unrelated symptom (an empty label) down to
`getComputedStyle`, and confirmed with `isVisible()`.

### The rule, concretely

- Assert `isVisible()`, and where the control accepts input, actually type into
  it and read the value back. `fill()` on a hidden or `inert` element fails or
  silently writes nothing — that failure is the signal.
- `count()` answers "did I wire the component in", which is worth knowing and is
  a different question from "does it work".
- Treat `inert`, `hidden`, `aria-hidden`, `visibility` and zero-size as the same
  class of failure. All of them mean present-and-useless.
- **When adopting someone else's primitive, re-derive what your assertions mean.**
  The bug was not the missing prop; it was that a proxy stayed in the test after
  the thing it proxied for had changed underneath it.

### A third instance: a reassuring message that was false

The client answered *every* failed fetch with "You look offline. We've saved
your email and we'll send it the moment you're back." A 404, a 5xx, a CORS
rejection or a missing env var in production all produced that sentence. The
address was not saved, and the person had no reason to try again — a false
reassurance is worse than a blunt error precisely because it stops them
retrying.

Now three distinct paths, with `test/failure-paths.test.mjs` locking them:

| Case | Result | Message | Queued? |
|---|---|---|---|
| `navigator.onLine === false` | `OFFLINE` | "You're offline… we'll send it when you're back" | **yes** |
| 404 / 5xx / unreachable / timeout | `SERVER` | "That's our end… your email hasn't saved yet" | no |
| 400 | `VALIDATION` | says what is wrong | no |

**Only the offline path may claim the address is saved, because it is the only
one that queues it.** One test asserts that directly against the copy strings,
so rewording cannot quietly reintroduce the lie. Note the assertion matches an
*affirmative* claim (`we've saved`), not the word "saved" — a naive `/saved/`
fails the honest message and passes the dishonest one.

### The same shape, elsewhere in this branch

A `const` referenced above its own declaration (`DIETARY_OTHER_MAX`) blanked the
entire page at runtime with lint and build both green. Two failures in one
session that only *running the thing* exposed. Static checks confirm a file is
well-formed; they cannot confirm it does anything.

---

## → For the Security agent (`sec/hardening`)

### 1. `/api/waitlist` does not exist yet — I fall back

This is a static Vite SPA. There is no server and no `/api/waitlist`. My client
(`src/components/waitlist/api.js`) POSTs to `/api/waitlist` per the frozen
contract, and **falls through to the existing Google Apps Script webhook on 404 /
405 / 501 / transport failure** so no signup is lost before your branch ships.

**When `/api/waitlist` is deployed, delete `FALLBACK_URL` and the two
`postFallback()` calls in `api.js`.** Until then the webhook URL is hardcoded in
that file exactly as it was in `zuca-gate-v4.jsx` on `main` — I did not introduce
it, I moved it.

Note the fallback uses `mode: "no-cors"`, so its response is opaque and a write is
optimistically treated as accepted. That is precisely why it is a fallback.

### 2. Three things I need from the endpoint

1. **Return `position` in the 200 body.** The contract's `200 {"ok":true}` carries
   no position, but the confirmation screen shows "you're #143" — the highest-
   attention moment on the site. I currently read list size from the webhook's
   `GET`, which is a separate round trip and will break when the fallback is
   removed. `200 {"ok":true,"position":143}` is a superset of the contract and
   costs you nothing.
2. **Upsert on repeat email, don't 409 the profile.** Step 1 POSTs
   `{email, consent_marketing}` immediately. Step 2 POSTs a *second* time with
   the same email plus the full profile. If the second POST is rejected as a
   duplicate, **every step-2 answer is silently discarded.** Please upsert:
   same email + non-null profile fields = update the existing row. The UI treats
   409 on the step-2 POST as success because it cannot tell the difference.
3. **Rate limit per-IP, not per-email.** Two POSTs per signup is the normal path,
   plus retries. A limit of 2/min would break the happy path.

### 3. Consent evidence — contract amendment of 15 Aug 2026

**What I send.** Every payload — step 1 and step 2 — now carries
`consent_text_version`, a stable identifier for the exact wording the user was
shown. It is derived in `src/components/waitlist/consent.js` as:

```
<purpose>-<region>-<authored>-<fingerprint>
mkt-us-2026-08-15-7d912cf1
mkt-eea-2026-08-15-55babc95
mot-all-2026-08-15-14d950d1
```

The fingerprint is an FNV-1a hash of the exact rendered string, **including the
privacy link's label and href** — a consent that pointed at a different privacy
notice is a different consent. Because it's derived rather than hand-written,
editing a word in `src/content/copy.js` changes the version automatically. A
hand-maintained version number is worse than none: it looks like evidence right
up until someone edits the text and forgets to bump it.

**What I deliberately do NOT send.** `consent_timestamp` and `country` are
absent from the payload and must stay that way. A client-supplied timestamp is
not evidence and a client-supplied country is not a fact — both are trivially
forged and neither would survive being relied on. There is an explicit comment
in `api.js` saying so, so nobody "helpfully" adds them.

**`motivation_consent_text_version` — live, and the `+` interim is deleted.**
Both identifiers now travel in their own fields. The interim that joined them
was not merely superseded — **it was invalid**: `consentVersionField()`
constrains ids to `/^[A-Za-z0-9._-]+$/`, and `+` is not in that set. Every
step-2 submit from someone who ticked the health box would have 400'd and lost
the whole profile. It is removed rather than left behind a boolean.

**You must store the wording, not just the version.** A version identifier is
only evidence if the text it points at is retained immutably. The strings live
in `src/content/copy.js` and are therefore in git history, but git history is
not a compliance record — please snapshot `version → exact text` server-side at
write time.

### 3b. What I found verifying against your shipped code

I ran my real version ids and real `buildPayload()` output through
`origin/sec/hardening:src/lib/validation.js` rather than reading the handoff
prose. Three things did not match, two of them silent data loss:

| # | Finding | Status |
|---|---|---|
| 1 | **`+`-joined ids fail `consentVersionField()`.** `/^[A-Za-z0-9._-]+$/` excludes `+`, so every health opt-in would have 400'd. | Fixed — dedicated field, join deleted. |
| 2 | **I was never sending `consent_health`.** It is in your schema, it defaults to `false`, and your comment says `motivation` is *dropped entirely* without it. It is not in the contract in `AGENTS_BRIEF.md`, so I had no way to know it existed without reading your code. **Every health answer collected so far would have been silently discarded.** | Fixed — sent explicitly on every payload, including `false`. |
| 3 | **My health id `mot-all-…` parsed as `unknown` regime.** Not currently a wrong flag (only `us` triggers), but it left `health_regime` unauditable on every record, and any future rule that treats `unknown` as suspect would have been blind. | Fixed — now `mot-eea-…`, which your parser reads as `eea`. |

On the audience token: **your code is already right and your prose is stale.**
`consentRegime()` accepts `['eu','eea','gdpr','uk']`, so my `mkt-eea-…` resolves
correctly — but §1e-bis of your handoff asks for `mkt-eu-`. Worth fixing the
prose so the next person doesn't standardise on the wrong one.

Verified end-to-end against your actual `waitlistSchema` and
`reconcileConsentRegime`:

```
regime      mkt-us-2026-08-15-7d912cf1   → us
            mkt-eea-2026-08-15-0dd5ad8b  → eea
            mot-eea-2026-08-15-14d950d1  → eea      (was: unknown)

schema      step 1 only                  ✓ valid
            step 2, health opted IN      ✓ valid   consent_health true,  motivation kept, mot version set
            step 2, health opted OUT     ✓ valid   consent_health false, motivation null,  mot version null

reconcile   DE + EEA copy → not flagged   mkt eea / health eea
            DE + US  copy → FLAGGED       mkt us  / health eea
            US + US  copy → not flagged   mkt us  / health eea
```

`motivation` is now also dropped client-side unless `consent_health` is true, so
the data cannot outlive its opt-in on either side of the wire.

**One thing for you.** `consent_health` is a required part of the record but is
not in the frozen contract in `AGENTS_BRIEF.md`. Please add it there — I only
found it by reading your source, and the next agent to code against the brief
will hit the same silent drop.

### 4. Region-based consent wording

EEA/UK visitors get explicit opt-in wording naming what we send and how often;
everyone else gets the US phrasing. **Same single unchecked checkbox either way
— only the sentence changes.** No country-based form branching beyond that.

`country` is server-derived, so the client cannot know it at render time.
Rather than block the hero on a lookup, the client guesses the region from the
browser's IANA time zone — no network call, no cookie, no IP handling — and the
guess is **deliberately biased toward the strict wording**: anything uncertain,
unparseable, or `Europe/*` resolves to EEA. Explicit wording is never wrong in
the US; the softer US wording shown in the EEA is a violation.

**The guess being wrong doesn't corrupt the evidence**, which is the point of
doing it this way — `consent_text_version` records what was *actually rendered*.
That gives you a reconciliation you should run:

> if server-derived `country` ∈ EEA/UK **and** stored `consent_text_version`
> starts with `mkt-us-` → that person saw the weaker wording. Flag for
> re-consent before including them in an EEA send.

I expect this to be a small number (VPNs, travellers, misconfigured clocks), but
it will not be zero.

### 4b. Extension reconciliation — verified against `sec/hardening@385b1ac`

Checked by running my real `buildPayload()` output through your real
`waitlistSchema` (33 keys, enumerated from the zod shape), not against either
side's prose.

**Naming is now clean in both directions.** I adopted your vocabulary wherever
you already had one:

| was (mine) | now (yours) |
|---|---|
| `address_postal` | `address_postal_code` |
| `consent_mail` | `consent_postal` |
| `mail_consent_text_version` | `postal_consent_text_version` |
| `company_name` | `company` |
| `company_headcount` | `headcount` |

Verified: **zero keys I send that you reject on naming, zero keys you accept
that I never send.** The internal state names changed too, so there is one
vocabulary rather than a translation layer that can drift.

**Three bugs of mine you would have caught the hard way, now fixed:**

1. **Stale `*_other`.** Pick "Other", type, switch to "Friend" — I was still
   sending the string, and your `superRefine` rightly rejects it as
   `other_not_selected`. Now paired at both layers: cleared from state on
   deselect, and refused by `buildPayload` regardless of what state holds.
   That second guard is the one that matters, because state outlives the UI
   that set it.
2. **Phone.** Normalised to E.164 (`toE164`) against your exact rule. Anything
   that cannot be normalised is sent as `null` rather than sent to fail —
   losing a phone number beats losing the record it was attached to.
3. **`address_country`.** Now an ISO 3166-1 alpha-2 picker, not free text.
   "USA" and "United States" both failed your `/^[A-Z]{2}$/`.

**Still failing, and all on your side** — the vocabulary you said you would
adopt. Listed so you can tick them off:

| Field | You have | I send |
|---|---|---|
| `quantity_band` | `qty_1 qty_2_3 qty_4_6 qty_7_12 qty_12_plus` | `lt_4 4_8 9_16 17_30 gt_30` (per month) |
| `office_interest` | `boolean` | `yes` \| `maybe` \| `no` |
| `headcount` | `hc_1_10 hc_11_50 hc_51_200 hc_201_1000 hc_gt_1000` | `lt_10 10_49 50_199 200_999 gt_1000` |
| `dietary`, `dietary_other` | — | array<enum> max 3 + string ≤120, **Art 9** |
| `channel`, `channel_other` | — | array<enum> max 2 + string ≤120 |
| `research_optin` | — | boolean\|null |

Two notes on those:

- **`dietary` needs the same Art 9 treatment as `motivation`** — dropped
  entirely without `consent_health`. I already drop it client-side.
- **`superRefine` needs two more pairs.** `channel_other` and `dietary_other`
  have no pairing rule yet; without one they are the only free-text fields that
  could arrive orphaned.

### 4c. SMS consent now has an EEA wording

`sms-us-` was the only SMS string, so every EEA opt-in reconciled as "shown US
copy in the EEA" and flagged for re-consent. **That flag was correct** — the
wording really was drafted against the wrong rulebook — so the fix is a second
string, not a quieter tag.

```
sms-us-2026-08-17-43da99ea    TCPA express written consent
sms-eea-2026-08-18-25206b1e   GDPR: purpose, frequency, withdrawal, no sharing
```

Same region guess and the same strict-by-default bias as the marketing consent,
so an unresolvable region gets the EEA wording. `sms_consent_text_version`
carries whichever was actually rendered.

### 5. Bot signals I already send

- `hp_field` — honeypot, off-screen (not `display:none`). Must be empty.
- `form_render_ts` — ms epoch stamped once per form mount. `<2s` to submit = bot.
- Both are in every payload, including the fallback path.

### 6. `/privacy` link — no action needed

The consent checkbox links to `/privacy` (`step1.privacyHref` in
`src/content/copy.js`). It 404s on my branch and that is expected: you build
those pages on `sec/hardening` and the link resolves once all three branches
merge. Confirmed with Emil — **the link stays as-is.**

Only tell me if the real path is something other than `/privacy`; that's a
one-line change.

### 7. Failed submissions are queued client-side

On total transport failure the payload is parked in `localStorage`
(`zuca_waitlist_queue_v1`, max 10) and replayed on next mount and on the `online`
event. It contains an email address. If your headers or storage policy conflict
with that, tell me and I'll drop it — but then an offline submit is simply lost.

---

## → Decisions taken (Emil, 15 Aug 2026)

1. **Intro gate: removed for everyone**, not conditionally skipped. UX owns the
   change; my UTM-based skip is gone and no growth code branches on traffic
   source. UTM capture and attribution are unaffected. Details in the UX
   section above.
2. **No figures of any kind on the page — in either direction.**

   *Retail price.* The page is measuring willingness to pay, and any figure
   corrupts the `price_band` answer. The hero and footer `$28 / box of 12`
   blocks are gone, and the "What will it cost?" FAQ names no number — it says
   the price isn't fixed and points at the step 2 question, which turns the
   objection into a reason to answer. Verified D2C reference is **$2.99/unit**;
   the $28 figure was stale. `price_band` stays framed as a 12-pack.

   *Input costs.* The pulp disposal figure (**$25/ton**) is removed everywhere:
   it is supplier-negotiation and competitor-intelligence information, and to a
   consumer it reads "cheap" rather than "clever". Headline variant B was built
   entirely on that number and is rewritten — it now reads *"Juiceries throw the
   fiber away. We rescued it and turned it into dessert."* The pulp FAQ keeps
   the rescue story with no economics in it.

   **The upcycling story stays; no number is ever attached to it.** There is a
   standing note at the top of `src/content/copy.js` stating this, so a figure
   doesn't creep back in.

   Verified against the production bundle: the only dollar strings that ship are
   the five `price_band` *answer options*, which are the question itself and are
   fixed by the frozen contract.
3. **Allergens: publish only what is certain.** Both flavors contain tree nuts —
   almonds and pecans — and that is stated plainly in the three-number block
   footnote and in full in the FAQ. **Nothing else is published.** Gluten/oats
   status, dairy in the Chocolate Raspberry Sea Salt, and shared-facility
   cross-contact are all absent by design, pending written confirmation from
   Step Change Innovations. The allergen FAQ ends with "We're not publishing a
   guess."

   ⚠️ **There is a BLOCKING TODO at the top of `src/content/copy.js`** listing
   exactly what is unconfirmed. **Do not add any of those items, and do not
   soften that FAQ line, until Emil has the manufacturer's written
   confirmation.** This is the one item on this branch that must be closed
   before a large list reads the page.
4. **`/privacy`** — expected 404 on this branch, resolves on merge. No change.

## Historical sheet reconciliation

The live sheet already holds rows from the old pre-order modal, with their own
value sets:

```
Reason:         fiber, gut, sustainability, weight, other
How They Heard: friend, stanford, social, physician, other
```

The contract enums are frozen, so I reconciled in code rather than changing
either side. **`LEGACY_MAP` and `DISCONTINUITIES` in
`src/components/waitlist/fields.js`** are the authority — apply `LEGACY_MAP` to
old rows to unify each column.

| Legacy | → New | Note |
|---|---|---|
| `gut` | `gut_health` | Clean 1:1. |
| `sustainability` | `sustainability` | Unchanged. |
| `other` | `other` | Unchanged, both columns. |
| `friend` | `friend` | Clean 1:1. |
| `physician` | `doctor` | Same concept; the contract spells it `doctor`. I changed the visible label from "A doctor or dietitian" to **"A physician"** so the wording stays continuous. |
| `fiber` | — | **No successor.** It was the general "I want more fiber" reason; the new options split that across `digestion`, `regularity`, `gut_health`, `energy`, `family_health`. For period comparison, treat legacy (`fiber` + `gut`) as the union of those five. Do **not** bucket it into `other`. |
| `weight` | — | **Retired.** Weight-loss framing is forbidden by the claim guardrails, so it is not offered as a new option. Historical rows keep the value — don't rewrite or delete them — but the series ends at the cutover. |
| `social` | `instagram` + `tiktok` | **Split.** Legacy rows can't be attributed to a platform after the fact, so platform-level series start at the cutover. For a continuous series, sum `instagram + tiktok` against legacy `social`. |
| `stanford` | — | **No successor.** The contract enum has no equivalent and adding one would break the frozen contract. New rows from that channel land in `event` or `other`, so this is a closed series. UTMs are the better instrument for it now. |

### ⚠️ The column *names* changed too — this needs action on the Apps Script

The old modal posted `{name, email, phone, hearAbout, reason, ts}`. The contract
payload posts `{email, zip, motivation, intent, price_band, flavor,
is_clinician, referral_source, consent_marketing, utm, page_path, hp_field,
form_render_ts}`.

**`hearAbout` → `referral_source` and `reason` → `motivation`.** If the Apps
Script maps a fixed set of keys to columns, every step-2 answer is silently
dropped on the fallback path — which is the *only* live path until
`/api/waitlist` ships.

I deliberately did **not** alias the new values back into the legacy
`hearAbout` / `reason` columns. Writing `motivation: "digestion"` into a column
whose historical domain is `fiber|gut|sustainability|weight|other` would corrupt
exactly the continuity we're trying to preserve. New columns, plus the mapping
table above, keeps both eras clean.

**Emil — the Apps Script is yours; it needs the new columns added before the
campaign sends.** I don't own that file and haven't touched it.

### `zip` is hidden for non-US visitors

The contract fixes `zip` to `/^[0-9]{5}$/` — a US postcode — while the outreach
list spans four continents. The field is now **not rendered at all** for anyone
the time-zone guess places outside the US. A field someone has to be told to
skip is still friction on the only screen that matters.

The postal detector biases the *opposite* way to the consent one, deliberately:

| Detected | Behaviour |
|---|---|
| `us` (incl. PR, USVI, Guam, Saipan, American Samoa — all on 5-digit ZIPs) | Field shown, no hint. It's their own postcode. |
| `non_us` | Field not rendered. Never validated, always sent as `null`. |
| `unknown` (no `Intl`, unresolvable zone) | Field shown **with** the "US only — skip this if you're somewhere else" hint. This is what the hint is for. |

Consent fails toward strict because the downside is a regulator; postal fails
toward showing because the downside is one optional data point. Both biases are
documented at the top of `src/components/waitlist/region.js`.

Verified across `America/New_York` (shown), `Pacific/Guam` (shown),
`Europe/Berlin`, `Asia/Tokyo`, `America/Sao_Paulo` (all hidden), and all three
ambiguous paths — no `Intl`, throwing `Intl`, empty time zone (shown + hint).

`step2_view` and `step2_submit` now carry `postal_region`, so you can see how
much of the list this actually affects.

**Demand-clustering data is therefore US-only by design.** Given `country` is
now server-derived, leaning on that is probably cheaper than widening `zip` to a
free-form international postal string (`SW1A 1AA`, `100-0001`). Your call — no
change needed from me unless you want the wider field.

### Cadence is a promise, not copy

The EEA wording commits to **"about two emails a month, plus a short series when
we launch."** GDPR requires a clear statement of what will be sent and how
often, so a number had to be there — and the launch sequence is named up front
rather than quietly breaking the promise in week one.

This is an operational constraint on the sending schedule. If the real cadence
changes, tell me and I'll change the text, which mints a new consent version
automatically — exactly as it should. That is not a cost to avoid; it is the
mechanism working.

The change from the first draft moved the EEA version from `…-55babc95` to
`…-0dd5ad8b` with no version number touched by hand. US and motivation versions
are unchanged, which is the other half of the property: **only the wording that
actually changed mints a new identifier.**

### Motivation question is now behind a disclosure

Per Emil: the health block sits behind **"Want to help shape what we make?"**,
collapsed by default. **Consent order is preserved** — opening it reveals the
opt-in checkbox *first*, with the chips disabled until it is ticked. Collecting
first and asking after would have been cheaper on space and would not have been
consent.

Native `<details>`, so no JS, keyboard-complete, and the collapsed height is
stable — opening it cannot shift anything above it. Closing it also clears the
opt-in and the selections, so a collapsed panel can never hide data we are still
holding.

Measured at 390px: the step 2 card is **1506px collapsed, 2072px open — 566px
saved** for everyone who doesn't open it.

`step2_motivation_open` is instrumented, so the take-up rate is visible rather
than assumed.

## Pre-order sweep (security §3a)

No payment has been taken, no order exists, no contract of sale has been formed
— so nobody may be described as having pre-ordered or reserved anything.

Eight of security's ten occurrences were already gone on this branch: the modal
that held three of them was deleted, both CTAs became "Get first access", the
nav became "Waitlist open", the hero eyebrow became "Waitlist open · First run
is limited", and the counter became "already in line". Two remained, both in
`src/content/copy.js`:

| Was | Now | Why |
|---|---|---|
| `130+` · "pre-orders before launch" | live count · "already on the waitlist" | Past-tense pre-order claim, and a hardcoded number that goes stale. |
| `Day 1` · "**sold out** at a physician symposium" | `Day 1` · "**samples gone** at a physician symposium" | **Not on security's list.** Same defect: the samples ran out, they were not sold. It asserts a transaction that did not happen, exactly like "reserved" does. |

Also: headline variant A's subhead hardcoded "130+ people already in line".
Replaced with "about 40% of your daily fiber in one bite" — a fact that cannot
go stale.

**The count is no longer hardcoded anywhere.** `ProofStrip` takes the live sheet
count as a prop, so deleting the ten test rows self-corrects the site instead of
leaving a number in copy that we would then have to defend. The row is always
rendered and only the numeral appears when the fetch lands, so there is no
layout shift.

Left alone, per the rule that future tense is accurate:
- `preorder_now` intent enum — records stated intent, not a transaction.
- The `CONSENT_TEXTS` marketing wording — already future tense.
- `fields.js` comment describing "the old pre-order modal" — historically
  accurate description of a thing that existed.

One piece of dead code I did not touch: the `PRE-ORDER MODAL` CSS block in the
`css` template string in `zuca-gate-v4.jsx` (~130 lines) is orphaned now that
the modal is gone. Invisible to users. I left it because UX is actively
rewriting that string and removing it would only create a conflict — worth
deleting on the UX branch.

## ZIP — confirmed fixed, and the residual path is safe too

Security is right that it was a live bug, and it was worse than a rejected
field: the schema is `.strict()`, so an invalid `zip` **400s the entire
submission** and loses the email with it.

Confirmed against their real `waitlistSchema`:

```
zip "0150"        ✗ 400 invalid_zip     ← Norwegian postcode
zip "0150 Oslo"   ✗ 400 invalid_zip
zip "SW1A 1AA"    ✗ 400 invalid_zip
zip ""            ✓ accepted → stored as null
zip null          ✓ accepted → stored as null
```

Confirmed from real browser POST bodies, not from reading the code:

| Visitor | Field rendered | Sends | Schema |
|---|---|---|---|
| `Europe/Oslo` | no | `zip: null` | ✓ |
| `Asia/Tokyo` | no | `zip: null` | ✓ |
| US, left blank | yes | `zip: null` (**not `""`**) | ✓ |
| US, filled | yes | `zip: "94305"` | ✓ |

**`null`, not empty string** — `buildPayload` coerces via `zip || null`, so an
untouched field and a hidden field produce the identical record.

**The residual path is covered as well.** A Norwegian on a VPN whose browser
reports a US time zone *does* see the field. Tested: typing `0150 Oslo` leaves
`0150` in the input (numeric-only, capped at 5), and submitting fires **zero**
requests — the client-side check catches it first and shows "A US ZIP is five
digits — or leave it blank." So even when the region guess is wrong, the 400 is
unreachable and nothing is lost. The email was banked at step 1 regardless.

### Still open

- **Analytics tool.** Nothing is installed. Events buffer and auto-forward the
  moment `window.plausible`, `window.dataLayer`, or `window.gtag` exists. Say
  the word and I'll add a cookieless script tag — no banner needed.
- **"Pre-orders" vs "waitlist".** 130+ pre-orders is a fact about the past and I
  kept it as proof. But the CTA now takes no payment, so all forward-looking
  language is first-access framing. If you are actually taking pre-orders,
  that's a different funnel and I should build it differently.

---

## Claim guardrails — what I removed and why

Every one of these was live on `main`:

| Removed | Where | Why |
|---|---|---|
| "Your gut is **sick**. Fix it." | Hero `<h1>` | Implies the product mitigates a condition. |
| "the snack brand that **clinicians recommend**" | Intro gate | "Physician-recommended" is explicitly forbidden. |
| "A **chronic disease** epidemic. We build the snack that actually addresses it." | Hero body | Product + disease in one claim. |
| "Reversed **autoimmune disease** through diet" | Kelley's credentials | Named condition sitting next to the product. Biographical, but on a product page it reads as a claim. |
| "**Clinician-formulated**" ×2 | Product + footer | Implies clinical endorsement. Replaced with the brief-allowed "Developed with input from 10+ physicians across 7 specialties". |
| "**Weight management**" | Motivation dropdown | Weight-loss framing. Not in the contract enum either. |
| "Your gut is sick. Give it fiber." | Footer `<h2>` | Same as the hero. |
| "0g **Refined** sugar" | Hero stat row | Unverified. The brief says *no added sugar*. Now "0g Added sugar". |

**Borderline lines I wrote in the safe form,** flagged per the brief:

- Every fiber statement is nutrient-content or population-statistic only:
  "10g of fiber", "about 40% of your daily fiber", "95% of American adults and
  kids fall short on fiber". No structure/function claim is attached to an outcome.
- The FAQ says the pulp "is made in facilities that comply with 21 CFR 117"
  — a factual statement about the facility, not an implication of FDA approval.
  Cooley is described as advising the company, never as endorsing it.
- `referral_source: doctor` is labelled "A doctor or dietitian". This asks how
  the *user* heard about Zuca. It is not a recommendation claim and the enum is
  fixed by the contract, but it is the closest line to the boundary — say the
  word and I'll relabel it "Through a healthcare professional".
- `is_clinician` is asked as a plain factual question about the person. It must
  never be turned into "trusted by clinicians" copy on the strength of the answers.

---

## Files I own and changed

```
src/content/copy.js                              new — all copy, A/B swappable
src/lib/analytics.js                             new — funnel + UTM capture
src/components/waitlist/WaitlistForm.jsx         new — orchestrator, lazy step 2
src/components/waitlist/Step1Email.jsx           new
src/components/waitlist/Step2Profile.jsx         new — lazy chunk
src/components/waitlist/Confirmation.jsx         new — lazy chunk
src/components/waitlist/primitives.jsx           new — minimum viable ui/
src/components/waitlist/fields.js                new — contract enums + labels
src/components/waitlist/api.js                   new — contract client + queue
src/components/waitlist/store.js                 new — shared state, 2 instances
src/components/waitlist/waitlist.css             new
src/components/waitlist/tokens.fallback.css      new — DELETE ON UX MERGE
src/components/content/sections.jsx              new — proof, numbers, FAQ
src/components/content/sections.css              new
src/zuca-gate-v4.jsx                             edited — see below
docs/screenshots/*.png                           new — 18 states at 390/360px
```

`src/zuca-gate-v4.jsx` is the whole site in one file, so I could not avoid it.
My edits there are deliberately surgical: swap copy for `src/content/copy.js`
imports, delete the old modal, mount `<section id="waitlist">`, wire both CTAs,
add the gate skip, add `NumberBlock` + `Faq`. **I did not touch the `css` template
string, the cursor, the grain canvas, or the page transition.**

Note: the brief specifies `src/lib/analytics.ts`. This repo is plain JS with no
`tsconfig`, so it is `analytics.js` to match. Rename freely if TS lands.

## Pre-existing issue I did not fix

`npm run lint` reports one error on `main` that is not mine:
`src/zuca-gate-v4.jsx:44` — `Cannot access variable before it is declared`
(`animRing` self-references inside its own `useCallback`). It is in the cursor
hook, which is UX-owned. Unchanged from `main`.
