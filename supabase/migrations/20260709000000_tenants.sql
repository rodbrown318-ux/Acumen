-- Shared tenants table. Every agent resolves the caller's tenant against
-- this table (see supabase/functions/_shared/auth.ts) so a single set of
-- agent deployments can serve any number of businesses.
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

insert into public.tenants (slug, display_name)
values ('complete-staffing', 'Complete Staffing')
on conflict (slug) do nothing;
