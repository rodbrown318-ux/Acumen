# Complete Staffing — Site Build Roadmap

A prioritized plan to close the gap between the current brochure-style site
(`completestaffing.org`) and a self-serve platform, benchmarked against
Aya Healthcare. The strategy is **not** to clone Aya — it's to add the two or
three self-serve pieces candidates actually decide on (browsable jobs + visible
pay) while keeping fast, local, human follow-up as the differentiator Aya can't
match at scale.

Effort is in rough dev-days for a single mid-level full-stack dev. "Backend
exists" means the Supabase schema / Edge Functions in this repo already cover
most of it, so the work is mostly front-end surfacing.

## Guiding principle

| Aya's edge | Our counter-move |
| --- | --- |
| Largest job database, self-serve search | A focused, fast, local board — same core function, less friction |
| Pay-package transparency (login-gated) | Show pay ranges **without** a login — beat them on friction |
| Volume + algorithm, impersonal | Same-day human response, local FL relationships, training pipeline |
| Native apps | Installable PWA — 80% of the value, a fraction of the cost |

---

## Tier 1 — Highest leverage (do first) · ~2–3 weeks

| # | Item | Effort | Backend status |
| --- | --- | --- | --- |
| 1 | **Public job/shift board** with visible pay ranges, filters (role, city, type), and per-job apply CTA | 4–6 d | ✅ Backend prototyped in this PR (`supabase/functions/jobs` + migration) — needs a front-end that fetches it |
| 2 | **Two-track homepage**: "Find Work" vs. "Request Staff" split above the fold | 2–3 d | N/A (marketing) |
| 3 | **Low-friction apply**: progressive form (name + role + phone first), "text a recruiter" option, mobile-first | 3–4 d | Needs a lightweight `applications` table + intake function |
| 4 | **Instant lead routing**: every submission → CRM + recruiter SMS, so no lead is ever dropped | 2 d | Reuse the Resend/notify pattern from `operations/email.ts`; add SMS |

**Exit criteria:** a candidate on mobile can find an Orlando CNA shift, see the
pay, and apply in under 60 seconds — and a recruiter is pinged within a minute.

## Tier 2 — Trust & differentiation (the moat) · ~2 weeks

| # | Item | Effort | Notes |
| --- | --- | --- | --- |
| 5 | **City landing pages** (`/cna-jobs-orlando`, etc.), programmatically generated per city × role | 3–4 d | Mirrors Aya's biggest SEO engine, at local scale |
| 6 | **Acumen training → placement funnel**, made explicit ("Not certified? Get certified → guaranteed interview") | 2 d | Unique to us; Aya has no entry-level pathway |
| 7 | **Local proof blocks**: facility logos, avg. time-to-placement, real candidate reviews | 2–3 d | Trust signals a national brand can't localize |
| 8 | **Compliance/credential badges** (HIPAA, background-verified, 24/7) as icons, not buried text | 1 d | — |

## Tier 3 — "Indestructible" = resilience · ~1.5 weeks

Most of "indestructible" is this unglamorous list.

| # | Item | Effort | Notes |
| --- | --- | --- | --- |
| 9 | **Speed**: static-first / CDN-cached pages, image optimization, green Core Web Vitals | 2–3 d | A regional site loading < 1s beats a heavy enterprise site |
| 10 | **Security hygiene**: HTTPS everywhere, form spam protection (Turnstile/hCaptcha), rate limiting, WAF (Cloudflare) | 2–3 d | — |
| 11 | **Reliability**: automated backups, uptime monitoring (UptimeRobot), error tracking (Sentry) | 1–2 d | — |
| 12 | **Accessibility (WCAG 2.1 AA)** | 2 d | Legally important in healthcare; also SEO |

## Tier 4 — Match Aya's polish (later) · ongoing

| # | Item | Effort | Backend status |
| --- | --- | --- | --- |
| 13 | Application status tracking (submitted → interview → placed) | 4–5 d | Needs `applications` state machine |
| 14 | Saved jobs + job alerts by email/SMS | 3–4 d | Reuse notify pattern |
| 15 | Candidate portal (credential upload, availability, pay stubs) | 8–10 d | ✅ `caregiver_credentials` / `caregiver_availability` already model this |
| 16 | Installable **PWA** instead of native apps | 3–4 d | — |

---

## Recommended tech stack for the "indestructible" layer

```
Next.js / Astro (static-first)   ── front-end, CDN-cached
        │
   Cloudflare (WAF, CDN, DDoS, bot protection) + Turnstile on forms
        │
   Supabase (this repo's Edge Functions + Postgres)  ── existing backend
        │
   Sentry + UptimeRobot ── monitoring     Plausible/GA4 → CRM ── analytics
```

## What's already in this repo vs. what's net-new

- **Already here:** the Operations agent's `shifts`, `caregivers`,
  `caregiver_credentials`, `caregiver_availability` schema — the data model a
  public board (#1) and candidate portal (#15) read from.
- **Added in this PR:** public pay/city columns on `shifts` + the read-only
  public `jobs` Edge Function (#1's backend).
- **Net-new later:** an `applications` table + intake function (#3, #13), the
  marketing front-end itself, and the infra/hardening in Tier 3.

## Suggested parallelization (when we build the front-end)

The backend is coupled and best done inline, but the front-end phase splits
cleanly across agents/devs with little overlap:

- **Track A — Candidate flow:** job board (#1), apply form (#3), city pages (#5)
- **Track B — Facility flow:** "Request Staff" path (#2), local proof (#7)
- **Track C — Infra/hardening:** Tier 3 in full (#9–#12)
- **Track D — Content/SEO:** copy, badges (#8), training funnel (#6)
