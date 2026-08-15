-- Facility / client side of the marketplace: the "Request Staff" intake and
-- the client records it attaches to. Tenant-scoped like everything else, so it
-- is automatically multi-tenant — the same tables serve any agency running on
-- the platform (white-label), keyed by tenant_id.

-- A hiring client (hospital, ALF, SNF, home-health agency, or a private family).
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  city text,
  created_at timestamptz not null default now()
);
create index if not exists clients_by_tenant on public.clients (tenant_id, created_at desc);
-- One client per (tenant, lowercased name) so repeat requests reuse the record.
create unique index if not exists clients_tenant_name
  on public.clients (tenant_id, lower(name));

-- An open request for staff. Reviewed by the agency, then turned into shifts.
create table if not exists public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  client_id uuid references public.clients (id) on delete set null,
  facility_name text not null,
  requester_name text not null,
  requester_email text not null,
  requester_phone text,
  city text,
  role text not null,
  required_credential text,
  employment_type text
    check (employment_type is null or employment_type in ('per_diem', 'travel', 'contract', 'permanent')),
  headcount smallint not null default 1 check (headcount >= 1),
  start_date date,
  end_date date,
  shift_notes text,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'approved', 'filled', 'declined')),
  created_at timestamptz not null default now()
);
create index if not exists staff_requests_by_tenant
  on public.staff_requests (tenant_id, status, created_at desc);

-- Same posture as the other business tables: RLS on, no policies, service-role
-- only (the intake function reads/writes server-side).
alter table public.clients enable row level security;
alter table public.staff_requests enable row level security;
