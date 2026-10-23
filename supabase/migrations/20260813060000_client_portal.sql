-- Locked-down client portal + verified-caregiver directory.
--
-- Two things this closes:
--   1. The client (facility) side gets a *logged-in* identity, not just the
--      public "Request Staff" intake. A client contact is linked to an
--      auth.users account so they can sign in and see their own requests and
--      the directory. The `client` Edge Function gates everything behind this
--      JWT (see supabase/functions/client/).
--   2. A caregiver only appears in the directory once their credentials are
--      *verified* by the agency. Credentials carry a verification status that
--      an admin sets (see the admin Edge Function's verifyCredential action);
--      "verified" is an explicit human/agent decision, never just "a row
--      exists". Contact details are never exposed in the directory — clients
--      reach a caregiver through the agency (Request Staff), so browsing is
--      gated and PII stays server-side.
--
-- Tenant-scoped like everything else, so it is automatically multi-tenant.

-- 1. Link a client contact to their auth account (mirrors caregivers.auth_user_id
-- and the admins table from 20260813050000_auth.sql).
alter table public.clients
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;
create unique index if not exists clients_auth_user
  on public.clients (auth_user_id) where auth_user_id is not null;

-- A signed-in client reads only their own row (defense in depth; the Edge
-- Function uses the service role, which bypasses RLS). RLS is already enabled
-- on clients in 20260813040000_facilities.sql.
create policy clients_self_select on public.clients
  for select to authenticated
  using (auth_user_id = auth.uid());

-- 2. Credential verification: the agency approves (or rejects) each credential.
-- Only 'verified', non-expired credentials make a caregiver directory-eligible.
alter table public.caregiver_credentials
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.admins (id) on delete set null,
  add column if not exists rejection_reason text;

-- Supports the directory query: verified, non-expired credentials per caregiver.
create index if not exists caregiver_credentials_verified
  on public.caregiver_credentials (caregiver_id)
  where verification_status = 'verified';

-- 3. Directory consent: a caregiver can opt out of being listed to clients.
-- Default is listed (opt-out, not opt-in) so a verified caregiver is
-- discoverable unless they choose otherwise.
alter table public.caregivers
  add column if not exists directory_opt_out boolean not null default false;
