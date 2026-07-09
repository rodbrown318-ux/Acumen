-- Domain tables for the Operations Agent: shift scheduling, caregiver
-- matching, and the shared agent_decisions audit log every agent writes to.
-- All tables are tenant-scoped (tenant_id -> tenants.id) so the same schema
-- serves any business, not just Complete Staffing.

create table if not exists public.caregivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  full_name text not null,
  email text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.caregiver_credentials (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers (id) on delete cascade,
  credential_type text not null,
  expires_at timestamptz, -- null = does not expire
  created_at timestamptz not null default now()
);

-- Simple recurring weekly availability. A caregiver can have multiple rows
-- (one per available window per weekday).
create table if not exists public.caregiver_availability (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  client_site text not null,
  role_required text not null,
  required_credential text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  -- 'unfilled_escalated' is available for a human to set manually (e.g. to
  -- pull a shift out of automated matching); the agent itself only ever
  -- moves a shift between open/offered/filled and tracks alerting via
  -- escalated_at, so a 4-hour alert doesn't stop it from still trying.
  status text not null default 'open'
    check (status in ('open', 'offered', 'filled', 'unfilled_escalated')),
  assigned_caregiver_id uuid references public.caregivers (id),
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shifts_open_by_tenant
  on public.shifts (tenant_id, status, start_time)
  where status in ('open', 'offered');

create table if not exists public.shift_offers (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  caregiver_id uuid not null references public.caregivers (id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  response_token uuid not null default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null
);

create unique index if not exists shift_offers_response_token
  on public.shift_offers (response_token);

create index if not exists shift_offers_pending_by_shift
  on public.shift_offers (shift_id, status);

-- Generic decision/audit log every agent (not just Operations) writes to.
create table if not exists public.agent_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  agent text not null,
  decision_type text not null,
  subject_type text not null,
  subject_id uuid,
  summary text not null,
  reasoning jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_decisions_by_tenant
  on public.agent_decisions (tenant_id, agent, created_at desc);

-- These tables hold business/PII data and are only ever accessed by agents
-- via the service-role key, which bypasses RLS. RLS is enabled with no
-- policies so anon/authenticated keys are denied by default.
alter table public.caregivers enable row level security;
alter table public.caregiver_credentials enable row level security;
alter table public.caregiver_availability enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_offers enable row level security;
alter table public.agent_decisions enable row level security;
