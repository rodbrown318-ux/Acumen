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

---

## Build status — Aya feature parity (backend)

Shipped as Edge Functions + migrations (candidate-facing set):

| Aya feature | Status | Where |
| --- | --- | --- |
| Public job board + pay | ✅ | `functions/jobs` |
| Quick-apply lead capture + recruiter SMS | ✅ | `functions/applications` |
| Candidate portal (profile %, tasks, assignments) | ✅ | `functions/portal` |
| Registration wizard (profession/specialty/experience) | ✅ | `functions/register` |
| Self-service (contact, credentials, availability) | ✅ | `functions/account` |
| Saved searches + job alerts (email on match) | ✅ | `functions/account`, `functions/alerts` + cron |
| Application status tracking | ✅ | `applications.caregiver_id` → `functions/portal` |
| "Recommend my recruiter" referrals | ✅ | `functions/account` (`recommendRecruiter`) |
| Market insights (Aya Index-style) | ✅ | `functions/insights` |

Deferred (not candidate-facing or out of current scope):
- Native iOS/Android apps → do a **PWA** instead (roadmap Tier 4 #16).
- Employer/VMS suite (LotusOne, Workforce AI, CoreHire) → the facilities track,
  intentionally parked until the multi-track homepage.
- CEU / continuing-education platform.
- Recruiter-side status console (advancing an application through the pipeline)
  — the data model supports it; the internal UI isn't built.
- Auth: candidate endpoints use opaque `portal_token` magic-links; move to
  Supabase Auth JWT before writes handle anything sensitive.

---

## Appendix: Aya's logged-in UX patterns (competitive reference)

Observed from Aya's live registration, candidate dashboard, and job-search
screens. These are the concrete targets the roadmap items above map to — copy
the *structure*, deliver it at local scale without the enterprise weight.

### Registration = short multi-step wizard (maps to Tier 1 #3)
A 3-step wizard with a visible progress indicator (1 → 2 → 3). Step asks only:
**Profession** (e.g. CNA / Nurse Assistant), **Primary Specialty** (e.g. Acute
Care Float), **Experience** (e.g. 5 years) — all **dropdowns**, Back/Next.
Right rail: "Instant access. Endless possibilities." + real clinician photos.
Takeaway: keep our apply to 2–3 short steps, dropdown-driven, no résumé to
start. Our quick-apply (name + phone → recruiter texts back) is an even lower
first rung; the wizard is the "full profile" upgrade path.

### Candidate portal = profile % + task list + saved searches (maps to Tier 4 #15)
`my.ayahealthcare.com` — left sidebar: Home · Search jobs · My jobs · Profile ·
Documents & tasks · My team. Home shows:
- **"Complete your profile — 0 of 7 sections, 0%"** ring with a GET STARTED CTA.
- **"Get ready for your next assignment"** checklist: verify contact info,
  work history & references, job preferences, checklists, **expiring compliance
  items** (done items shown green-checked).
- **Saved searches** ("get notified in real time").
- A persistent **"Recommend my recruiter"** button (referral loop).
Takeaway: our `caregiver_credentials` / `caregiver_availability` schema already
backs the compliance-tasks and preferences pieces. The profile-% ring and task
checklist are the engagement mechanic worth copying.

### Job search = three-pane + filter drawer (maps to Tier 1 #1, our board)
Results header: **"227 Openings (158 Unique jobs)"** + Sort by. Cards show
**location · role/title · specialty · shift pattern (1×12 Day) · pay
($360.00/shift) · # openings**, with a right-hand **job-detail pane** and a
**filter drawer**: Specialties · Locations · Employment types · Shifts &
contracts · Additional. Actions: **Save this search**, **Apply with Aya**.
Pay carries the disclaimer *"approximate — confirm with your recruiter."*
Takeaways for our board:
- Add **shift pattern** and **# openings** to job cards (we already show role,
  facility, city, date, type, pay).
- A **"Save this search"** action = our job-alerts feature (Tier 4 #14).
- The three-pane layout is right at Aya's scale (hundreds of jobs); our
  simpler top-filter + list is the correct choice until volume demands a drawer.
- Follow the **pay disclaimer** pattern so shown ranges never become a
  compliance/expectation problem.
