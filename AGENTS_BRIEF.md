# ZUCA WEBSITE — SHARED BRIEF (paste into all three agents)

> This block is identical in all three agent prompts. It is the contract that lets three
> agents work on the same repo at the same time without blocking or colliding.

## The product (verified facts — do not invent others)

- Zuca upcycles apple pulp — a waste byproduct juiceries pay to dispose of ($25/ton) — into fiber-rich snack bites.
- **Per serving: 10g fiber, 150 kcal, 4g protein, 6g natural sugar, no added sugar.** ~40–45% of daily recommended fiber. 2x the fiber of leading competitors.
- Two flavors: **Chocolate Raspberry Sea Salt** and **Maple Pecan**.
- Traction: **130+ pre-orders.** Samples ran out on Day 1 at the Vituity Health symposium (physician network: 6,000+ docs, 10M+ patients/yr). Ran out in 45 minutes at Stanford Founder's Demo Day (300+ investors, 1,500+ attendees).
- Founders: **Emil Nordin** — Norway's Most Promising Young Chef 2021, trained at Kontrast (2 Michelin stars + Green Star), Stanford Bioengineering '26. **Kelley Yuan, MD** — Stanford Medicine physician, leads Zuca's clinical network (10+ physicians across 7 specialties).
- Supported by Stanford's NEXT Accelerator / Emergence program. Pro bono FDA regulatory counsel from Cooley LLP. Manufacturing via Step Change Innovations in 21 CFR 117-compliant facilities.
- Context: 95% of American adults and kids are fiber deficient. Rotting food waste = 8% of US greenhouse gas emissions.
- Target D2C price: $2.99/unit.

## Health-claim guardrails (NON-NEGOTIABLE — this is a food product under FDA scrutiny)

Zuca is a food, not a drug. Nothing on the site may state or imply that it treats, prevents, cures, or mitigates a disease.

**Allowed** (structure/function + factual nutrient content):
- "10g of fiber per serving — about 40% of your daily fiber."
- "Fiber supports digestive health." / "Supports regularity." / "Good source of dietary fiber."
- "95% of Americans don't get enough fiber." (cited statistic about the population, not a product claim)
- "Created by a Michelin-trained chef and a Stanford physician."
- "Built with input from 10+ physicians across 7 specialties."

**Forbidden:**
- Any mention of Zuca and a named disease in the same claim: diabetes, colon cancer, IBS, diverticulitis, constipation-as-condition, heart disease, obesity.
- "Physician-recommended," "doctor-approved," "clinically proven," "reduces your risk of," "prevents," "treats."
- Weight-loss or GLP-1 claims.
- Implying FDA endorsement because Cooley/ex-FDA attorneys advise the company.

If you believe a line is borderline, write it in the safe form and note it in your handoff file. Do not ship the risky version.

## Design tokens contract (UI/UX agent owns the values; everyone codes against these names)

All agents reference these CSS custom properties. They exist in `src/styles/tokens.css` from the first commit of the UI/UX branch. Never hardcode a hex value or a px font size anywhere else.

```
--z-bg  --z-surface  --z-surface-alt  --z-ink  --z-ink-muted  --z-border
--z-brand  --z-brand-dark  --z-accent  --z-accent-ink  --z-warm
--z-success  --z-danger  --z-focus
--z-step--1 --z-step-0 --z-step-1 --z-step-2 --z-step-3 --z-step-4   (fluid type scale)
--z-space-1 … --z-space-8   --z-radius-sm --z-radius-md --z-radius-full
--z-shadow-sm --z-shadow-md   --z-ease --z-dur
```

Starting values (UI/UX agent may refine against the real packaging/logo, but must keep the names and keep AA contrast):

```css
--z-bg:#FBF6EE; --z-surface:#FFFFFF; --z-surface-alt:#F3EADA;
--z-ink:#1E1A17; --z-ink-muted:#5B5148; --z-border:#E7DCCB;
--z-brand:#1F6B4A; --z-brand-dark:#14472F;
--z-accent:#C2314B; --z-accent-ink:#FFFFFF;   /* primary CTA */
--z-warm:#E08A3C; --z-success:#2E7D5B; --z-danger:#B3261E; --z-focus:#1F6B4A;
```

Type: display face **Fraunces** (variable, warm serif — reads "chef-made"), body/UI face **Inter**. Self-hosted `.woff2`, latin subset, `font-display:swap`, preloaded. No Google Fonts CDN request (privacy + LCP).

## Waitlist data contract (frozen — all three agents code against exactly this)

`POST /api/waitlist` · `Content-Type: application/json`

```jsonc
{
  "email":            "string, required, RFC-lite validated, lowercased, trimmed, <=254 chars",
  "zip":              "string|null, /^[0-9]{5}$/",
  "motivation":       "array<enum>|null, max 3, one of: digestion, regularity, gut_health, energy, sustainability, doctor_suggested, family_health, other",
  "intent":           "enum|null: preorder_now | very_interested | curious | just_browsing",
  "price_band":       "enum|null: lt_24 | 24_29 | 30_35 | 36_42 | gt_42   // for a 12-pack",
  "flavor":           "enum|null: choc_rasp_salt | maple_pecan | both | undecided",
  "is_clinician":     "boolean|null",
  "referral_source":  "enum|null: doctor, friend, instagram, tiktok, event, search, email, other",
  "consent_marketing":"boolean, required, must be true",
  "utm":              "object|null: {source,medium,campaign,content,term} each <=64 chars",
  "page_path":        "string|null, <=200 chars",
  "hp_field":         "string|null   // honeypot, must be empty",
  "form_render_ts":   "number|null   // ms epoch when form mounted; <2s to submit = bot"
}
```

Response: `200 {"ok":true}` · `400 {"ok":false,"error":"validation"}` · `409 {"ok":false,"error":"duplicate"}` (treat as success in the UI) · `429 {"ok":false,"error":"rate_limited"}` · `500 {"ok":false,"error":"server"}`.

**Only `email` + `consent_marketing` are required.** Everything else is optional and collected *after* the email is already captured. The email must be persisted even if the user abandons step 2.

`motivation` is health-adjacent personal data. It is stored only with explicit, separate opt-in and is never sent to a third-party analytics tool. Analytics gets counts, never values tied to an email.

## Branch + file ownership (this is what makes "simultaneous" work)

Each agent works on its own branch cut from `main` and touches **only** its owned paths.

| Agent | Branch | Owns |
|---|---|---|
| UI/UX | `ux/mobile-redesign` | `src/styles/**`, `src/components/ui/**`, layout/section/nav/footer components, `public/images/**`, font files |
| Conversion | `growth/waitlist-conversion` | `src/components/waitlist/**`, `src/lib/analytics.ts`, page copy files, `src/content/**` |
| Security | `sec/hardening` | `src/app/api/**` (or `server/**`), `middleware.ts`, `next.config.*`/`vite.config.*` security sections, `src/lib/validation.ts`, `src/lib/ratelimit.ts`, `.env.example`, `/privacy`, `/terms`, security docs |

Rules for all three:
1. `git checkout main && git pull && git checkout -b <your-branch>` before any edit. Never commit to `main`.
2. If your work requires a change in a file you do not own: **do not edit it.** Append the request to your own handoff file: `HANDOFF-ux.md` / `HANDOFF-growth.md` / `HANDOFF-sec.md` at repo root. Each agent writes only its own handoff file, so these never conflict.
3. Commit in small, self-describing commits. Do not rebase or force-push. Do not merge another agent's branch into yours.
4. `package.json` is shared. Adding a dependency is allowed but list every addition at the top of your handoff file with a one-line justification, so merge conflicts there are resolved in seconds.
5. Merge order is **UX → Conversion → Security**. Assume your branch will be merged in that order; write code that tolerates the other two not existing yet.
6. Never commit secrets, `.env`, real customer data, or API keys. Never run destructive git commands (`reset --hard`, `clean -fd`, `push --force`).

## Universal constraints

- **Mobile-first, and mean it.** Design at 390×844 first. Test 360px width (nothing may horizontally scroll), 390px, 430px, then 768/1280. Thumb-zone: primary CTA reachable in the bottom third. Tap targets ≥44×44px. Inputs `font-size:16px` minimum so iOS does not zoom on focus.
- **Performance budget:** LCP < 2.0s on simulated Fast 3G / 4x CPU throttle, CLS < 0.05, INP < 200ms, total JS shipped to the landing route < 120KB gzipped, hero image < 150KB (AVIF/WebP with fallback, explicit width/height, `fetchpriority=high`).
- **Accessibility:** WCAG 2.2 AA. Real `<label>`s, visible focus rings, `prefers-reduced-motion` respected, form errors announced via `aria-live`, keyboard-completable, `inputmode="email"` and `autocomplete="email"`.
- Do not add a cookie banner unless a tracker requires one — prefer analytics that doesn't.
- Ask before installing any heavy framework or animation library. Prefer CSS.

## Definition of done for every agent

Post a short report: what changed, why, screenshots or measured numbers, what you did NOT do and why, and the contents of your handoff file. Then stop — do not merge to `main` yourself.
