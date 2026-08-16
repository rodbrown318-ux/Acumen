-- Aya-style candidate features: richer profiles, application linkage,
-- referrals, and job-alert dedupe.

-- Registration wizard fields (profession / specialty / experience).
alter table public.caregivers
  add column if not exists profession text,
  add column if not exists specialty text,
  add column if not exists experience_years smallint
    check (experience_years is null or experience_years >= 0);

-- Link a captured application back to a caregiver profile when known, so the
-- portal can show application status. Nullable + set null so a general
-- application (or a removed caregiver) never breaks the lead.
alter table public.applications
  add column if not exists caregiver_id uuid references public.caregivers (id) on delete set null;

create index if not exists applications_by_caregiver
  on public.applications (caregiver_id)
  where caregiver_id is not null;

-- "Recommend my recruiter" style referrals.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  caregiver_id uuid references public.caregivers (id) on delete set null,
  referral_name text not null,
  referral_contact text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists referrals_by_tenant on public.referrals (tenant_id, created_at desc);

-- Dedupe: a saved-search alert fires at most once per (search, shift).
create table if not exists public.job_alerts_sent (
  id uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references public.saved_searches (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  sent_at timestamptz not null default now()
);
create unique index if not exists job_alerts_sent_unique
  on public.job_alerts_sent (saved_search_id, shift_id);

-- Same posture as the other PII tables: RLS on, no policies, service-role only.
alter table public.referrals enable row level security;
alter table public.job_alerts_sent enable row level security;
