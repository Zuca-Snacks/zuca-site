# HANDOFF — Security branch (`sec/hardening`)

Requests for files I do not own, plus everything Emil needs to do outside the codebase.
Full reasoning for all of it is in [SECURITY.md](SECURITY.md).

Merge order is UX → Conversion → Security, so I am last. Everything below assumes my branch
is already in.

---

## Dependencies added to `package.json`

| Package | Where it runs | Why |
|---|---|---|
| `zod@^4` | **Server only** — imported by `api/waitlist.js` via `src/lib/validation.js`. Verified absent from the client bundle (`ZodError` does not appear in `dist/assets/*.js`). | Strict schema validation for the waitlist contract, with unknown-key rejection. Hand-rolling this was the alternative; the contract has 14 fields and 5 enums, and a hand-rolled validator is where the bug would be. |

`npm audit fix` also updated `package-lock.json` (31 packages, no `package.json` range changes) and
took the repo from **9 advisories (7 high) → 0**. All were devDependencies — `vite`, `postcss`,
`@babel/core`, `launch-editor` — so none of them reached production. They still mattered: one was
arbitrary file read via the Vite dev server, and three dev servers are running on Emil's laptop.

Three scripts added: `npm run security:test` (129 endpoint cases), `npm run security:test:sheet`
(40 Apps Script cases), and `npm run security:headers`.

---

## 1 → Conversion agent (`growth/waitlist-conversion`) · **BLOCKING**

**This is the one that matters. Until it lands, the critical findings are only half fixed.**

The hardened endpoint exists and is tested, but the browser still posts directly to the public
Google Apps Script webhook at [src/zuca-gate-v4.jsx:5](src/zuca-gate-v4.jsx#L5). While that line
stands, the endpoint I built is bypassed and the write path is still unauthenticated, unmetered and
public (SECURITY.md S1/S3).

You own `src/components/waitlist/**`. Whoever ends up owning the submit handler, these are the
changes:

### 1a. Point at our own origin

```diff
-const SHEETS_URL = "https://script.google.com/macros/s/AKfycbz…/exec";
+// Server-side endpoint. The Apps Script URL is now a server-only env var —
+// it must never appear in client code again. See SECURITY.md S3.
+const WAITLIST_URL = "/api/waitlist";
+const COUNT_URL    = "/api/count";
```

### 1b. Drop `mode:"no-cors"` and actually read the response

`no-cors` makes the response opaque, which is why every submission currently reports success even
when the write fails — silent, unrecoverable loss of real signups (S7). Same-origin needs no such
mode:

```js
const res = await fetch(WAITLIST_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },   // required — 415 otherwise
  body: JSON.stringify(payload),
});

if (res.status === 200 || res.status === 409) {
  // 409 = already on the list. Show the same success state; do not tell the
  // visitor their address was already there and do not treat it as an error.
  setSubmitted(true);
} else if (res.status === 429) {
  setFormErr("Too many attempts just now — please try again in a minute.");
} else {
  setFormErr("Something went wrong on our end. Please try again.");
}
```

### 1c. Add the two invisible bot layers

Zero friction, no CAPTCHA, no user-visible change. The server enforces both.

```jsx
{/* Honeypot. Must be invisible to people and visible to form-fillers, which
    rules out display:none — many bots skip those. Off-screen + aria-hidden +
    tabIndex -1 + autoComplete off is the combination that works and stays
    accessible: a screen reader never reaches it. */}
<div style={{ position:"absolute", left:"-9999px", top:0, width:1, height:1, overflow:"hidden" }}
     aria-hidden="true">
  <label htmlFor="hp_field">Leave this field empty</label>
  <input id="hp_field" name="hp_field" type="text" tabIndex={-1}
         autoComplete="off" value={hp} onChange={e=>setHp(e.target.value)} />
</div>
```

```js
// Capture when the form mounted; send it with the payload.
const formRenderTs = useRef(Date.now());
// …then include  form_render_ts: formRenderTs.current  in the body.
```

A submission under 2 seconds is treated as a bot. **The server returns `200 {"ok":true}` for both
bot cases** — deliberately. A bot that gets an error iterates until it stops getting one; a bot
that gets the same success as everyone else has nothing to optimise against. Do not "fix" this by
surfacing an error.

### 1d. Consent — currently missing entirely, and required

There is no consent checkbox on the form today. The frozen contract requires `consent_marketing`
to be literally `true`, and the server rejects anything else with a `400`. This is not box-ticking:
we are about to send cold marketing email, and consent we cannot evidence is consent we do not have.

```jsx
<label style={{ display:"flex", gap:".6rem", alignItems:"flex-start" }}>
  <input type="checkbox" required checked={consentMarketing}
         onChange={e=>setConsentMarketing(e.target.checked)} />
  <span>
    Email me when pre-orders open. You can unsubscribe any time.
    {" "}See our <a href="/privacy">Privacy Policy</a>.
  </span>
</label>
```

**A pre-ticked box is not consent** under CPRA or GDPR. It must start unchecked.

### 1e. Separate opt-in for the health question

The "Why do you want Zuca?" answers (`gut_health`, `digestion`, `doctor_suggested`) are
health-adjacent personal data. The brief requires explicit, separate opt-in — and the server
enforces it: **if `consent_health` is not `true`, `motivation` is discarded server-side and never
written to the sheet**, even when the user selected values. So without this checkbox, you will
collect that data and silently lose all of it.

```jsx
<label>
  <input type="checkbox" checked={consentHealth}
         onChange={e=>setConsentHealth(e.target.checked)} />
  <span>Store my reason for interest so you can tailor what you send me. Optional.</span>
</label>
```

Show it only once a motivation is selected, so it never appears on the hero email capture.

### 1e-bis. Send `consent_text_version` with every submission · **contract amendment**

Three fields were added to the contract for consent evidence. **Two of them are mine and need
nothing from you** — `consent_timestamp` and `country` are set server-side and are *rejected with a
400* if the client sends them, because evidence a submitter can supply is not evidence.

The third is yours, because only the client knows which wording it rendered:

```js
consent_text_version: "2026-08-15.marketing.a"
```

**You own the wording; I own storing it.** The registry lives in `CONSENT_TEXTS` in
[src/lib/validation.js](src/lib/validation.js) and maps each id to its verbatim text:

```js
export const CONSENT_TEXTS = {
  '2026-08-15.marketing.a': {
    purpose: 'marketing',
    regime: 'global',   // 'global' | 'eea' | 'us' — overrides the token parse
    text: 'Email me when pre-orders open. You can unsubscribe any time.',
  },
  '2026-08-15.health.a': {
    purpose: 'health',
    regime: 'global',
    text: 'Store my reason for interest so you can tailor what you send me.',
  },
};
```

The wording in 1d and 1e above matches these entries exactly. **If you change a single word of
either line, add a NEW entry rather than editing the existing one** — editing would retroactively
rewrite what past signups are recorded as having agreed to, which is precisely what this exists to
prevent. Old ids stay forever so historical records remain resolvable. Tell me the new id and text
and I will add it, or add it yourself; that file is mine but this constant is genuinely shared.

**Forgetting to register an id does not break signups.** An unknown version is accepted, the record
is flagged `registry_match: false`, and the endpoint logs
`consent.unregistered_text_version`. Rejecting would mean a copy change that skips this step breaks
every signup on the site — a documentation lapse traded for total data loss. But it does weaken the
evidence, so do not lean on it.

Format is `YYYY-MM-DD.<purpose>.<letter>`; only `A-Z a-z 0-9 . _ -` are accepted, max 64 chars.

### 1e-ter. Stop packing two identifiers into one field · **now fixed on my side**

You were joining the marketing and health identifiers into `consent_text_version` with a `+` to get
past the strict validator. That was the right instinct given the field available, and the wrong
shape — so there is now a dedicated field:

```js
consent_text_version:            "mkt-eea-2026-08.a",     // the marketing line
motivation_consent_text_version: "health-eea-2026-08.a",  // the Art 9 line
```

**Why a separate field rather than a delimiter.** The entire legal basis for holding `motivation` is
that its consent was *separate and unbundled* from the marketing consent. A record that packs both
into one string does not evidence two acts — it evidences one combined act, which is the specific
thing Art 9(2)(a) does not accept. The shape of the record has to match the shape of the claim it
supports. `+` remains outside the permitted charset, so a packed pair still 400s rather than
silently becoming a fake single identifier.

The receipt now carries both independently:

```jsonc
{
  "schema": "zuca.consent.v2",
  "marketing": { "granted": true, "version": "…", "text": "Email me when pre-orders open…", "registry_match": true },
  "health":    { "granted": true, "version": "…", "text": "Store my reason for interest…",  "registry_match": true },
  …
}
```

Worth knowing what your question caught: the previous receipt embedded a **hardcoded** health
wording and recorded no health version at all. If you had changed that line, every new record would
have carried the *old* text as its evidence — confidently wrong, which is worse than missing. Fixed.

**Tag your version ids by audience.** I read the regime off the identifier, tokenised on `. _ -`:

| Token in the id | Read as | |
|---|---|---|
| **`eea`** | EEA/UK-targeted wording | **canonical — keep using this** |
| `eu`, `gdpr`, `uk` | EEA/UK-targeted wording | accepted synonyms |
| **`us`** | US-targeted wording | canonical |
| `usa`, `canspam` | US-targeted wording | accepted synonyms |
| none of the above | `unknown` | **flags the record — see below** |

So `mkt-us-2026-08.a` → US, `mkt-eea-2026-08.a` → EEA. It is tokenised rather than substring-matched
on purpose: a naive `/us/` test would read `2026-08-15.august.a` as US-targeted, and a wrong regime
produces a wrong re-consent decision. If you register an id in `CONSENT_TEXTS` you can set
`regime` explicitly and it overrides the parse.

**What this buys us.** The server compares the regime of the wording you served against the country
it derived from the IP. Someone in Oslo shown the US copy — VPN, travel, CDN edge decision, stale
cached bundle — is recorded with `needs_reconsent: TRUE` and a reason. That set is never empty at
any real volume, and those records are exactly the ones that look complete and would still fail an
audit. It is a filterable column, not a note in a JSON blob.

**An untagged id now flags the record.** This changed in response to the question "what happens to
`unknown` today?" — the answer was *nothing*, which was wrong. An EEA record whose wording carries no
audience tag is the state where we can least demonstrate GDPR-grade consent, and it was producing
the cleanest-looking row in the sheet. Untagged is also the default state of every newly minted
identifier, so it was simultaneously the most likely case and the least visible one.

Three outcomes now, in column `AA` (`consent_regime_status`):

| Status | When | What it means for you |
|---|---|---|
| `ok` | Regime matches, or the wording is registered as `global` | Nothing to do |
| `mismatch` | EEA visitor, US-tagged wording | **Definite problem.** Re-consent that person |
| `unverifiable` | EEA visitor, untagged wording | **Tag your ids.** Not proof of a problem, but we cannot demonstrate it was fine either |

So: tag every id `-eea-` or `-us-`, and `unverifiable` disappears. Registering an id in
`CONSENT_TEXTS` with `regime: 'global'` also clears it, and is the right answer when a single wording
is written to satisfy the strictest regime and used everywhere — which is what the two current
entries are.

Only EEA visitors are assessed. A non-EEA visitor with an untagged id stays `ok`; CAN-SPAM does not
ask where the wording was written.

### 1f. Map the current fields onto the frozen contract

The live form collects fields the contract does not have, and misses fields it does:

| Currently sent | Contract field | Action |
|---|---|---|
| `reason` (single string) | `motivation` (array, max 3) | Rename; wrap in an array. Map `gut`→`gut_health`, `fiber`→`digestion`, `sustainability`→`sustainability`, `weight`→ **drop this option, see §3**, `other`→`other` |
| `hearAbout` | `referral_source` | Rename. Map `physician`→`doctor`, `friend`→`friend`, `social`→`instagram`, `stanford`→`event`, `other`→`other` |
| `name` | *not in the contract* | Keep if you want it, but tell me so I add it to the schema, the sanitizer and the privacy policy. **The server currently rejects it as an unknown key.** |
| `phone` | *not in the contract* | Same — and phone is the most sensitive field on the form. If there is any chance of SMS, TCPA needs separate express written consent, which is a higher bar than the email checkbox. My recommendation is to drop it: it is optional, few will fill it, and it carries more risk than the rest of the form combined. |
| — | `consent_marketing` | **Required.** See 1d. |

### 1g. Delete the `localStorage` PII write

[src/zuca-gate-v4.jsx:1003-1005](src/zuca-gate-v4.jsx#L1003-L1005) writes the visitor's name, email
and phone into their own browser, permanently, under `zuca_submissions_v1`. Duplicate detection now
happens server-side (`409`), so this has no remaining purpose — it is PII at rest on a device we do
not control, reachable by any future XSS.

Keep at most a boolean:

```js
localStorage.setItem("zuca_signed_up", "1");   // no PII
```

### 1h. Read the counter from `/api/count`

Both `fetch(SHEETS_URL)` calls at [lines 963](src/zuca-gate-v4.jsx#L963) and
[1019](src/zuca-gate-v4.jsx#L1019) become `fetch("/api/count")`. Same `{count:N}` shape, so no other
change. Edge-cached for 60s, with a fallback so the hero never renders "0 pre-orders" during a blip.

---

## 2 → UI/UX agent (`ux/mobile-redesign`)

### 2a. Self-host the fonts (already in your brief; also a privacy finding)

[src/zuca-gate-v4.jsx:111](src/zuca-gate-v4.jsx#L111) `@import`s four families from
`fonts.googleapis.com` at runtime. Every visitor's IP and User-Agent goes to Google, undisclosed in
any policy we can currently honour, and the brief explicitly rules out the Google Fonts CDN. It is
also render-blocking, against the LCP budget.

Once fonts are local, tell me and I will tighten the CSP from
`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com`
down to `style-src 'self' 'unsafe-inline'; font-src 'self'`, and remove the paragraph about fonts
from the privacy policy.

### 2b. Footer links to `/privacy` and `/terms`

Both pages exist and are live at those paths (`public/privacy.html`, `public/terms.html`, routed in
`vercel.json`). Nothing links to them yet, and an unlinked privacy policy does not satisfy CCPA's
notice requirement — it has to be reachable from the page where collection happens.

The footer is [src/zuca-gate-v4.jsx:1449-1452](src/zuca-gate-v4.jsx#L1449-L1452):

```jsx
<div className="sf-copy">
  © 2026 Zuca Snacks · <a href="/privacy" className="sf-mail">Privacy</a>
  {" · "}<a href="/terms" className="sf-mail">Terms</a>
  {" · "}<a href="mailto:letschat@zucasnacks.com" className="sf-mail">letschat@zucasnacks.com</a>
  {" · "}Stanford, CA
</div>
```

(The copyright currently reads 2025.)

### 2c. Two things blocking a strict CSP

- **`cursor:none` on `html, body`** plus a JS-driven custom cursor. Not a CSP issue but worth one
  line: with JS disabled or broken, there is no visible pointer at all. Not my call, but I would
  not ship it.
- **`<style>{css}</style>` rendered from JS** forces `style-src 'unsafe-inline'`. It is not a real
  risk — the string is a compile-time constant, not user input — so I have kept it and left
  `script-src 'self'` clean, which is the directive that actually matters. If the CSS ever moves to
  a real `.css` file, I can drop `'unsafe-inline'` entirely.

---

## 3 → Health-claim violations · **FDA/FTC exposure, needs someone's decision today**

Not my files and not my call, but it is squarely in the risk register and the brief calls these
non-negotiable. Every item below contradicts the guardrails in `AGENTS_BRIEF.md`.

| Where | Current text | Problem | Safe rewrite |
|---|---|---|---|
| [index.html:7](index.html#L7) `<title>` | "ZUCA: **Physician-recommended** fiber snacks" | Explicitly forbidden. This is also the Google result and the browser tab. | "ZUCA: 10g fiber snacks, chef-made" |
| [index.html:8](index.html#L8) meta description | "**Physician-recommended** snacks with 10g fiber…" | Same | "Snacks with 10g of fiber per serving — about 40% of your daily fiber. Created by a Michelin-trained chef and a Stanford physician." |
| [index.html:9-10, 13-14](index.html#L9-L14) OG + Twitter | Same phrase, ×4 | Same — and these are what get pasted into Slack, LinkedIn and email previews | As above |
| [zuca-gate-v4.jsx:915](src/zuca-gate-v4.jsx#L915) | "building the snack brand that **clinicians recommend** and patients love" | "Physician-recommended" in other words. "Patients" frames buyers as sick people. | "built by a chef and a physician, for people who want more fiber" |
| [zuca-gate-v4.jsx:1211-1213](src/zuca-gate-v4.jsx#L1211-L1213) `<h1>` | "Your gut is **sick**. **Fix it.**" | States the consumer has a disease and that the product remedies it. This is the strongest violation on the page and it is the headline. | "Your gut wants more fiber. Give it some." |
| [zuca-gate-v4.jsx:1219](src/zuca-gate-v4.jsx#L1219) | "A **chronic disease epidemic**. We build the snack that **actually addresses it**." | Directly claims the product addresses chronic disease. | "95% of Americans don't get enough fiber. We make a snack that helps close the gap." (population statistic — allowed) |
| [zuca-gate-v4.jsx:1342](src/zuca-gate-v4.jsx#L1342) founder bio | "**Reversed autoimmune disease** through diet" | A disease-reversal claim on a product page reads as a product claim regardless of intent. | "Sustainability Fellow, Stanford Medicine" — or move the personal story to an About page well away from the buy button |
| [zuca-gate-v4.jsx:1373, 1418](src/zuca-gate-v4.jsx#L1373) | "**Clinician-formulated.**" ×2 | Borderline-to-forbidden; implies medical endorsement. | "Chef-crafted, physician-informed." — or the brief's approved line: "Built with input from 10+ physicians across 7 specialties." |
| [zuca-gate-v4.jsx:1415](src/zuca-gate-v4.jsx#L1415) footer | "Your gut is sick. Give it fiber." | Same as the h1 | "Not enough fiber? Give it some." |
| [zuca-gate-v4.jsx:1135](src/zuca-gate-v4.jsx#L1135) | dropdown option "**Weight management**" | Weight-loss claim, explicitly forbidden, and it is not in the contract's `motivation` enum either | Delete the option |

**Emil:** Cooley already advises Zuca on FDA regulatory matters pro bono. Send them this table and
the two legal pages in one email. The health claims are the more urgent half — the `<title>` tag is
what Google indexes, and "physician-recommended" on a food product is the exact phrase FTC
enforcement actions quote.

---

## 1g-bis. The 2026-08-17 extension — what the client must send · **Conversion**

All of it is in `AGENTS_BRIEF.md`. The parts that will bite if skimmed:

**Two new consents, same pattern as marketing and health.** Each needs its own unchecked box, its
own registered wording, and its own version id:

```js
consent_sms:    true,  sms_consent_text_version:    "sms-eea-2026-08.a",
consent_postal: true,  postal_consent_text_version: "postal-eea-2026-08.a",
```

Registered defaults are `2026-08-17.sms.a` and `2026-08-17.postal.a` in `CONSENT_TEXTS`. Tag your
own ids `-eea-`/`-us-` or EEA records flag as `unverifiable` — same rule as before.

**Gated storage cuts both ways, and both directions are enforced:**

| You send | Result |
|---|---|
| `phone` **without** `consent_sms` | phone silently discarded, signup succeeds |
| `consent_sms` **without** `phone` | **`400`** — an opt-in that can never be acted on |
| address **without** `consent_postal` | address discarded, signup succeeds |
| `consent_postal` without line1 + city + country | **`400`** |

**`phone` is strict.** Invalid format is a `400` for the whole submission — the opposite of `zip`.
Validate inline so the server's 400 is never the first the user hears of it. Rationale is in the
brief; tell me if you want it softened and I will, but then an SMS consent can end up recorded
against no number.

**`*_other` must be paired.** `motivation_other` requires `'other'` in `motivation`;
`referral_source_other` requires `referral_source === 'other'`. Text without the selection is a
`400` — unpaired free text is uninterpretable, and it is also what a probe looks like.

**Two postal codes, and they are not the same field.** `zip` is US-only and fails soft;
`address_postal_code` is international and strict. Do not wire the same input to both.

**Live counter: stop calling `/api/count` after a write.** The `200` response now carries the new
count:

```js
const res  = await fetch("/api/waitlist", {...});
const body = await res.json();          // {"ok":true,"count":138}
if (typeof body.count === "number") setClicks(body.count);
```

That is the read-after-write fix — no second request, so no cache to be stale. If you genuinely need
a standalone read immediately after a write, `GET /api/count?fresh=1` bypasses the cache; the plain
`GET /api/count` stays edge-cached for 60s and is right for page load.

## 1f-bis. `zip` is US-only, and now fails soft · **Conversion**

The contract's `zip` pattern is `/^[0-9]{5}$/` — a **US ZIP code**, not a universal postal code
field. **Render it only when you believe the visitor is in the US, and omit it otherwise.** That
guidance has not changed.

**What changed: an unrecognised value no longer costs the submission.** It is dropped to `null` and
the signup succeeds.

| Input | Before | Now |
|---|---|---|
| `94305` (US) | stored | stored |
| `0150` (Norway) | **whole submission rejected, email lost** | dropped to `null`, signup succeeds |
| `SW1A 1AA` (UK) | **whole submission rejected, email lost** | dropped to `null`, signup succeeds |
| `01000-000` (Brazil) | **whole submission rejected, email lost** | dropped to `null`, signup succeeds |

**This is intentional leniency, scoped to `zip` and nothing else.** Your timezone-based region guess
is the right call — no round-trip, biases correctly — but it is a guess, and it only has to be wrong
in one direction to lose an email. Wrong toward non-US just means no zip, which is harmless; wrong
toward US used to mean a Norwegian typed four digits and lost their signup. Losing an email is the
failure mode this endpoint exists to prevent, and a postal code is worth far less than the address
attached to it, so the postal code yields.

It is defence in depth *behind* your guard, not a replacement for it. Keep gating the field on the
guess — this just means the guess no longer has to be perfect.

**Everything else stays strict.** Unknown keys, bad enums, malformed emails, missing consent: all
still `400`. A non-string `zip` is still `400` — that is a malformed client or a probe, not
somebody's postcode. There is a test asserting the exemption has not spread: it fires five bad
enums at the endpoint and requires all five to be rejected, so if leniency ever leaks beyond this
field, the suite says so.

**You get a feedback loop.** Every dropped value logs `zip.dropped_not_us_format` with the
server-derived country and the input length — never the value. Watch it for a week after launch:
a low count means your timezone heuristic is working, a high count with EEA countries attached means
it needs tuning. That is a better signal than the country endpoint I offered and you declined, and
it costs the visitor nothing.

## 3a → "Pre-order" is a claim we cannot support · **UX + Conversion**

`AGENTS_BRIEF.md` now reads, on Emil's instruction: *"No payment has been taken — do not describe
these as pre-orders anywhere."* I updated the brief; the site copy is yours.

**Why it matters beyond wording.** No money has changed hands, no order exists, and no contract of
sale has been formed. Calling these pre-orders does two separate things: it overstates traction to
investors, and it misdescribes the transaction to consumers — which is an FTC problem in the US and
an unfair-commercial-practices problem in the EEA. The `/terms` page I wrote already states
plainly that joining is **not** a purchase, so the site currently contradicts its own terms.

Every occurrence, all in files I do not own:

| Location | Current | Suggested |
|---|---|---|
| [zuca-gate-v4.jsx:1200](src/zuca-gate-v4.jsx#L1200) nav | "Pre-order open" | "Waitlist open" |
| [:1208](src/zuca-gate-v4.jsx#L1208) hero eyebrow | "Pre-order · Limited Release" | "Waitlist · Limited First Run" |
| [:1296](src/zuca-gate-v4.jsx#L1296), [:1432](src/zuca-gate-v4.jsx#L1432) CTA buttons | "Pre-order now →" | "Join the waitlist →" |
| [:1307](src/zuca-gate-v4.jsx#L1307) counter | "pre-orders and counting" | "on the waitlist" |
| [:1077](src/zuca-gate-v4.jsx#L1077) modal eyebrow | "Pre-order" | "Join the waitlist" |
| [:1078](src/zuca-gate-v4.jsx#L1078) modal headline | "Reserve your box before we sell out." | "Be first to know when we launch." |
| [:1301](src/zuca-gate-v4.jsx#L1301), [:1440](src/zuca-gate-v4.jsx#L1440) confirmation | "✓ Reserved. We'll be in touch." | "✓ You're on the list. We'll be in touch." |

"Reserve" and "Reserved" carry the same problem as "pre-order" — both assert that something has been
held for the person, and nothing has.

**Future tense is fine.** "We'll email you when pre-orders open" is accurate: pre-orders are a real
future thing. The rule is about describing the *existing 127 people* as pre-orders. The consent
wording in `CONSENT_TEXTS` uses exactly that future form and does not need changing.

The `intent` enum value `preorder_now` also stays — it records what a person told us about their
intent, not a transaction that occurred.

## 3b → Sheet migration runbook (Emil, by hand in the Google Sheets UI)

The Conversion agent found a real bug and it is worth stating precisely, because the fix is not
quite what it looks like.

**The bug.** The old modal posts `hearAbout` and `reason`. The new contract posts `referral_source`
and `motivation`. An Apps Script that maps a fixed set of keys to columns writes *nothing* for a key
it does not recognise — no error, no warning, just an empty cell. So on the fallback path, which is
the only live path until `/api/waitlist` ships, every step-2 answer vanishes silently.

**Confirmed, by running it.** `npm run security:test:sheet` loads the real
[server/apps-script/Code.gs](server/apps-script/Code.gs) into a sandbox, points it at a mock sheet
carrying your current header row, and inspects which cell each field lands in. 17 checks, all
passing. The hardened script **does** accept `referral_source` and `motivation`, and **does**
auto-append any missing column on first write.

**But checking it surfaced two further problems in my own script, now fixed:**

1. **`name` and `phone` were being dropped too.** My original `COLUMNS` list was built from the
   frozen contract, which contains neither — so the hardened script would have silently discarded
   both, the same bug class one layer down. They are now legacy columns and are preserved.
2. **Header matching was case-sensitive.** An existing `Email` column would not have matched the
   canonical `email`, so the script would have created a *second* `email` column beside it and split
   your data across the two. Matching is now case- and separator-insensitive, so `Email`, `E-Mail`
   and `email` all resolve to one column.

**One field is dropped on purpose.** Legacy `reason` is the health question — GDPR Art 9 special
category data — and the old modal captures no consent for it whatsoever. Storing it would be
unlawful, so the hardened script discards it and writes `legacy_reason_dropped` to the execution log
each time. That is the one case where data disappearing is correct rather than a bug; it is now a
*known* drop instead of a silent one. Once the new form ships with its separate health opt-in, the
same information arrives as `motivation` with `consent_health: true` and is stored normally.

### ⚠️ Do this in the right order

**Deploy the hardened Apps Script only *after* the new client is live.** If you rotate first, the old
modal — which sends no token — gets `forbidden` on every write, and because it uses
`mode:"no-cors"` it *cannot read the response*. Every visitor would see "You're on the list" and
every signup would be lost, with nothing in the browser or the sheet to tell you. Sequence:

1. Add the columns (below) — safe at any time, changes nothing.
2. Conversion agent's client change merges and deploys.
3. Set the Vercel env vars.
4. Rotate the Apps Script last, then run the verification signup.

### Step 1 — add the columns

Strictly optional: `ensureColumns_` creates any missing column automatically on the first write.
Doing it by hand just means you choose the layout and can see it is right before real data arrives.

Open the sheet. **Row 1 only.** Leave `A`–`F` exactly as they are — those are your existing columns
and the script now recognises all of them.

Type these into row 1, left to right, starting in **cell G1**. Spelling must match exactly;
capitalisation and spaces do not matter, underscores do.

| Cell | Header | Cell | Header |
|---|---|---|---|
| **G1** | `zip` | **AB1** | `address_region` |
| **H1** | `intent` | **AC1** | `address_postal_code` |
| **I1** | `price_band` | **AD1** | `address_country` |
| **J1** | `flavor` | **AE1** | `consent_postal` |
| **K1** | `is_clinician` | **AF1** | `postal_consent_text_version` |
| **L1** | `referral_source` | **AG1** | `utm_source` |
| **M1** | `referral_source_other` | **AH1** | `utm_medium` |
| **N1** | `consent_marketing` | **AI1** | `utm_campaign` |
| **O1** | `consent_health` | **AJ1** | `utm_content` |
| **P1** | `motivation` | **AK1** | `utm_term` |
| **Q1** | `motivation_other` | **AL1** | `page_path` |
| **R1** | `quantity_band` | **AM1** | `consent_text_version` |
| **S1** | `office_interest` | **AN1** | `motivation_consent_text_version` |
| **T1** | `company` | **AO1** | `consent_timestamp` |
| **U1** | `headcount` | **AP1** | `country` |
| **V1** | `sms_phone` | **AQ1** | `needs_reconsent` |
| **W1** | `consent_sms` | **AR1** | `consent_regime_status` |
| **X1** | `sms_consent_text_version` | **AS1** | `reconsent_reason` |
| **Y1** | `address_line1` | **AT1** | `consent_receipt` |
| **Z1** | `address_line2` | **AU1** | `consent_ip_prefix` |
| **AA1** | `address_city` | **AV1** | `user_agent` |

42 new columns, `G` through `AV`. 48 columns total when you are done.

> **If you already added an earlier version of this list**, the 2026-08-17 extension appends 17 more
> (`referral_source_other`, `motivation_other`, `quantity_band`, `office_interest`, `company`,
> `headcount`, `sms_phone`, `consent_sms`, `sms_consent_text_version`, the six `address_*`,
> `consent_postal`, `postal_consent_text_version`). Earlier renames still apply:
> `consent_version` → `consent_text_version`, `consent_ts` → `consent_timestamp`. Header matching
> ignores case, spaces, hyphens and underscores. Order does not matter; the script matches on header
> text, not position — and it creates anything missing on first write, so this step is a convenience,
> not a prerequisite.

> ⚠️ **Do not rename the existing `phone` column (D), and do not point the new phone data at it.**
> Column `D` holds 137 legacy numbers captured by the old modal with **no consent of any kind**. The
> new consent-gated number goes to **`sms_phone` (V)**. Mixing them would leave the two
> distinguishable only by reading whether `consent_sms` is blank or `FALSE` — and the cost of
> getting that wrong is texting somebody who never agreed to be texted.

### Step 1b — put a filter on `needs_reconsent`

Worth thirty seconds now, because this is the column you will actually use. Select row 1 →
**Data → Create a filter**, then filter column `Z` (`needs_reconsent`) to `TRUE`.

That view is your re-consent queue: people the server believes were shown consent wording written
for the wrong jurisdiction — someone in Oslo served the US copy because of a VPN, travel, a CDN edge
decision or a stale cached bundle. Column `AA` (`consent_regime_status`) says whether it is a definite
`mismatch` or merely `unverifiable`, and `AB` says which consent and why. Nothing errors
when this happens and the row looks complete, which is precisely why it needs a column rather than
someone's memory.

**Do not delete `E` (`hearAbout`) or `F` (`reason`).** They hold your existing 136 rows of answers.
New signups write to `L` (`referral_source`) and `O` (`motivation`) instead, because the two use
different vocabularies — old `physician` versus new `doctor`, old `social` versus new `instagram`.
Merging them would quietly corrupt the meaning of the historical values. If you want one clean
column later, backfill deliberately with this mapping:

| Old `hearAbout` (col E) | New `referral_source` (col L) |
|---|---|
| `physician` | `doctor` |
| `friend` | `friend` |
| `social` | `instagram` |
| `stanford` | `event` |
| `other` | `other` |

### Step 2 — verify with a test signup

After the client is live and the Apps Script is rotated:

1. Open the site in a **private/incognito window** (so nothing cached interferes).
2. Fill the form properly — real-looking email you control, tick the consent box, and **take more
   than 2 seconds**. Submitting faster than that trips the bot timer and the row is discarded by
   design.
3. Watch the sheet. A new row should appear within a couple of seconds.

**Check these cells on the new row.** This is the actual test — a row appearing is not proof, since
the failure mode is a row appearing with empty cells:

| Cell | Should contain | If it is empty |
|---|---|---|
| `C` (`email`) | your test address, lowercased | Nothing is working — check the Vercel env vars |
| `M` (`consent_marketing`) | `TRUE` | The consent checkbox is not being sent |
| `V` (`consent_text_version`) | `2026-08-15.marketing.a` | The client is not sending the marketing wording id — see §1e-bis |
| `W` (`motivation_consent_text_version`) | the health wording id, *only if* you ticked the health box | Empty with the box ticked means the client is not sending it |
| `X` (`consent_timestamp`) | an ISO timestamp | You are on an old build of the endpoint |
| `Y` (`country`) | your 2-letter country, e.g. `NO` | Expected as `XX` on localhost; empty in production means the geo header is missing |
| `Z` (`needs_reconsent`) | `TRUE` or `FALSE` | Should never be blank. `TRUE` on your own test signup means the copy variant and your location disagree — see §1e-ter |
| `AB` (`consent_receipt`) | a JSON blob starting `{"schema":"zuca.consent.v2"` | The consent evidence record — this is what you would hand a regulator. Check it contains BOTH a `marketing` and a `health` block |
| `L` (`referral_source`) | your dropdown answer | **The exact bug this runbook is about** — the client is still sending `hearAbout` |
| `O` (`motivation`) | your answer, *only if* you ticked the health box | Empty with the box **unticked** is correct. Empty with it **ticked** is a bug |
| `B`, `D`, `E` (`name`, `phone`, `hearAbout`) | empty | These should be blank on the new path. Values here mean the old modal is still live |

4. Delete the test row when you are done.

**If a row does not appear at all**, look at the Apps Script execution log: Apps Script editor →
**Executions** in the left sidebar. `forbidden` means the token does not match between the
`ZUCA_TOKEN` script property and Vercel's `SHEETS_WEBHOOK_TOKEN`. Nothing at all means the request
never arrived — check `SHEETS_WEBHOOK_URL` points at the *new* deployment.

## 4 → Emil, outside the codebase

Full detail in [SECURITY.md §8](SECURITY.md). Ranked; 1–4 are pre-campaign blockers.

1. **Publish a DMARC record.** There is none. `_dmarc.zucasnacks.com` TXT →
   `v=DMARC1; p=none; rua=mailto:dmarc@zucasnacks.com; fo=1`. Start at `p=none`, move to
   `p=quarantine` after two clean weeks.
2. **Turn on DKIM in Google Workspace.** `google._domainkey.zucasnacks.com` is empty, so it was
   never enabled. Admin → Apps → Gmail → Authenticate email → Generate → publish → Start.
3. **Rotate the Apps Script deployment** and set `SHEETS_WEBHOOK_URL` + `SHEETS_WEBHOOK_TOKEN` in
   Vercel. Step-by-step at the bottom of [server/apps-script/Code.gs](server/apps-script/Code.gs).
   The step people skip is *archiving the old deployment* — that is what kills the public URL.
4. **Check the existing 136 rows for formula-injection payloads** before opening the sheet on a
   machine you care about: File → Download → CSV, then look at it in a text editor (not Excel) for
   any cell starting `=`, `+`, `-` or `@`.
5. **Provision Upstash Redis** (free tier) and set `UPSTASH_REDIS_REST_URL` / `_TOKEN`. Without
   them the rate limiter falls back to per-instance memory, which does not hold across serverless
   instances, and server-side duplicate detection is disabled.
6. **Create `privacy@zucasnacks.com`.** Both legal pages name it as the rights address.
7. **Insert the real postal address** into `public/privacy.html` and `public/terms.html` — search
   for `[POSTAL ADDRESS TO BE INSERTED BEFORE LAUNCH]`. CAN-SPAM requires a valid physical address
   in every marketing email and the policy should match it. I left a placeholder rather than
   inventing one.
8. **Check the sheet's sharing settings** — it must be "Restricted", named people only, with no
   "anyone with the link" entry.
9. **Add a CAA record** so not just any CA can issue for the domain:
   `zucasnacks.com. CAA 0 issue "letsencrypt.org"`.
10. **Decide on HSTS `includeSubDomains`.** I deliberately left it off. Your DNS is at
    WordPress.com, so there may be a subdomain I cannot see; turning it on when a subdomain is
    HTTP-only breaks it, and the setting sticks in browsers for two years. Confirm every subdomain
    is HTTPS and I will add it. Same reasoning for HSTS preload — that one is genuinely hard to undo.
11. **Watch the CSP reports for a week** before enforcing. `vercel logs --follow`, look for
    `csp.violation`. When the only entries are ones you recognise, move the policy from
    `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `vercel.json`.

---

## 5 → Things I chose not to do, and why

- **No CAPTCHA.** The brief asks for Turnstile as a third layer and I have left it unwired
  deliberately. The honeypot and the timing gate cost the user nothing and stop essentially all
  commodity form spam; a challenge on the hero email field would cost more real signups than bots
  cost us, which is the constraint you set. The Turnstile env vars are stubbed in `.env.example`,
  and the place to add it is right after the `detectBot()` call in `api/waitlist.js`. Add it **if**
  the logs show `reject.bot` volume climbing while `accepted` fills with junk — not before.
- **No git history rewrite.** The webhook URL is in commit `a0c52a8`. Rewriting history on a repo
  three agents are actively working from would be reckless, and it does not help: the URL is also
  in every deployed bundle. Rotation (item 3) is the fix, and history rewriting would add nothing
  once the old deployment is archived.
- **No credential rotation by me.** Yours to do, per the engagement rules.
- **No load test against production.** Firing 100 requests at the live webhook would have put ~100
  junk rows in your real 136-row pre-order sheet and visibly inflated the counter on the live site.
  I ran a single read-only `GET` against production to confirm it is unauthenticated and returns
  only a count. The full 55-case attack suite runs against the hardened endpoint locally:
  `npm run security:test`.
- **I did not fix the pre-existing lint errors** in `src/zuca-gate-v4.jsx` (20 of them — empty
  catch blocks and a `react-hooks/immutability` violation). Not my file. `npm run lint` will not be
  clean until someone addresses them. I did extend `eslint.config.js` with a Node-globals block
  scoped to `api/**`, `src/lib/**` and `scripts/**`, without which my files could not lint at all —
  that is the only shared file I touched beyond `package.json`.
