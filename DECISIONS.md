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

## Sugar claims — WITHDRAWN (Emil, 18 Aug 2026)

"No added sugar", "0g added sugar" and "6g natural sugar" are off the site and on
the forbidden list. Maple syrup is an added sugar under FDA rules. No replacement
sugar wording until the finished label is confirmed — every candidate needs a
fact we do not have.

The instructive part: `AGENTS_BRIEF.md` listed the claim as a *verified fact*, so
an agent correctly tightened "0g Refined sugar" (vague, undefined term) into
"0g Added sugar" (precise, defined, checkable — and false). Precise beats vague
only when precise is also true. Correcting the brief mattered more than
correcting its copies.

## Article 9 free text (Emil, 18 Aug 2026)

`motivation_other` is **deleted entirely** — no free-text box beside the health
question. A fixed enum bounds what we can learn about someone's health; an open
box invites a diagnosis into a spreadsheet. Three `*_other` fields remain:
`referral_source_other` (120), `channel_other` (120), `dietary_other` (**60**,
its own constant, with microcopy asking for allergen names not medical detail).

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

## Ownership (Emil, 17 Aug 2026)

One owner per layer, to stop two sessions reporting the same change. UX owns the
visual layer and edits it; the merge session integrates and verifies and does not
edit visual files. A peer relaying Emil's approval **is not** Emil's approval,
even when quoting him accurately.
