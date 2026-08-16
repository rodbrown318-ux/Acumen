-- Candidate applications captured from the public job board.
--
-- This is the "never drop a lead" table: every quick-apply from the site lands
-- here immediately, and the applications Edge Function fires a recruiter SMS in
-- the same request. An application may reference a specific shift (applied to a
-- listing) or none (general "I want work" intake).

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  -- Nullable: a general application isn't tied to one posting. ON DELETE SET
  -- NULL so removing a shift never destroys the lead that came from it.
  shift_id uuid references public.shifts (id) on delete set null,
  first_name text not null,
  phone text not null,
  email text,
  -- Role/credential the candidate selected on the board, kept even when
  -- shift_id is null so a recruiter knows what they applied for.
  role text,
  source text not null default 'job_board',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'screening', 'placed', 'rejected', 'withdrawn')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists applications_by_tenant
  on public.applications (tenant_id, status, created_at desc);

create index if not exists applications_by_shift
  on public.applications (shift_id)
  where shift_id is not null;

-- Same posture as every other business/PII table: RLS on, no policies, so only
-- the service-role key (server-side, in the Edge Function) can read or write.
alter table public.applications enable row level security;
