-- Real authentication foundation (Supabase Auth).
--
-- Links caregivers and a new `admins` table to auth.users, and adds RLS
-- policies so a logged-in user reads only their own rows (defense in depth for
-- when the frontend reads directly with a user JWT — the Edge Functions still
-- use the service role, which bypasses RLS).
--
-- Prerequisite (dashboard, not a migration): enable Email auth (magic link +
-- password) under Authentication → Providers. Provider/redirect config is
-- project settings, not schema.

-- Link a caregiver to their auth account.
alter table public.caregivers
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;
create unique index if not exists caregivers_auth_user
  on public.caregivers (auth_user_id) where auth_user_id is not null;

-- Agency staff (owners / admins / recruiters), tenant-scoped.
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'recruiter' check (role in ('owner', 'admin', 'recruiter')),
  created_at timestamptz not null default now(),
  unique (auth_user_id)
);
create index if not exists admins_by_tenant on public.admins (tenant_id);
alter table public.admins enable row level security;

-- Caregiver self-read policies: an authenticated user sees only their own rows.
create policy caregivers_self_select on public.caregivers
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy credentials_self_select on public.caregiver_credentials
  for select to authenticated
  using (caregiver_id in (select id from public.caregivers where auth_user_id = auth.uid()));

create policy availability_self_select on public.caregiver_availability
  for select to authenticated
  using (caregiver_id in (select id from public.caregivers where auth_user_id = auth.uid()));

create policy saved_searches_self_select on public.saved_searches
  for select to authenticated
  using (caregiver_id in (select id from public.caregivers where auth_user_id = auth.uid()));

create policy applications_self_select on public.applications
  for select to authenticated
  using (caregiver_id in (select id from public.caregivers where auth_user_id = auth.uid()));

-- An admin can read their own admin row. Tenant-scoped business reads for
-- admins come with the authenticated admin API (next step).
create policy admins_self_select on public.admins
  for select to authenticated
  using (auth_user_id = auth.uid());
