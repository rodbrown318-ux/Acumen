-- Candidate portal: a caregiver's logged-in home (profile completeness,
-- compliance tasks, upcoming assignments, saved searches).
--
-- Auth approach for the prototype: an opaque per-caregiver `portal_token`,
-- the same magic-link pattern already used for shift_offers.response_token.
-- It lets a caregiver load only THEIR own data without standing up full
-- end-user auth yet. Production should move to Supabase Auth JWT (see the
-- runtime note in CLAUDE.md) and rotate/expire these tokens; until then this
-- keeps the portal read-only and scoped to a single caregiver per token.

alter table public.caregivers
  add column if not exists portal_token uuid not null default gen_random_uuid();

create unique index if not exists caregivers_portal_token
  on public.caregivers (portal_token);

-- A caregiver's saved job searches -> the basis for job alerts. `filters` holds
-- the same shape the public board sends (role, city, credential, type).
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  label text not null,
  filters jsonb not null default '{}'::jsonb,
  notify boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists saved_searches_by_caregiver
  on public.saved_searches (caregiver_id, created_at desc);

-- Same posture as the other PII tables: RLS on, no policies, service-role only.
alter table public.saved_searches enable row level security;
