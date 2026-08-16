-- DEMO / SAMPLE seed data for LOCAL DEVELOPMENT ONLY.
--
-- Run automatically by `supabase db reset` (or manually in the SQL editor of a
-- throwaway project) to see every endpoint return live results end to end.
--
-- This is NOT production data. Real caregivers, shifts, clients and requests
-- come from the business — never from a seed or migration (see CLAUDE.md). Safe
-- to delete. Idempotency isn't needed: `db reset` runs this on a clean database.

do $$
declare
  t uuid;
  cg_dana uuid;
  cg_marco uuid;
begin
  select id into t from public.tenants where slug = 'complete-staffing';
  if t is null then
    raise notice 'Tenant complete-staffing not found; skipping demo seed.';
    return;
  end if;

  -- Caregivers (with a registration-wizard profile)
  insert into public.caregivers (tenant_id, full_name, email, phone, is_active, profession, specialty, experience_years)
  values (t, 'Dana Whitfield', 'dana@example.com', '+14075550101', true, 'CNA', 'Acute Care Float', 3)
  returning id into cg_dana;

  insert into public.caregivers (tenant_id, full_name, email, phone, is_active, profession, specialty, experience_years)
  values (t, 'Marco Reyes', 'marco@example.com', '+18135550102', true, 'RN', 'Med-Surg / Tele', 6)
  returning id into cg_marco;

  -- Credentials (one expiring soon, to exercise the portal's renewal task)
  insert into public.caregiver_credentials (caregiver_id, credential_type, expires_at) values
    (cg_dana, 'CNA', now() + interval '180 days'),
    (cg_dana, 'BLS', now() + interval '20 days'),
    (cg_marco, 'RN', now() + interval '300 days');

  -- Weekly availability
  insert into public.caregiver_availability (caregiver_id, weekday, start_time, end_time) values
    (cg_dana, 1, '06:00', '20:00'), (cg_dana, 2, '06:00', '20:00'), (cg_dana, 3, '06:00', '20:00'),
    (cg_marco, 4, '18:00', '23:59'), (cg_marco, 5, '18:00', '23:59');

  -- Open, public shifts (populate the board + insights)
  insert into public.shifts
    (tenant_id, client_site, city, role_required, required_credential, employment_type,
     start_time, end_time, pay_rate_min, pay_rate_max, pay_period, slots, is_public, status, public_summary)
  values
    (t, 'Orlando Health', 'Orlando', 'CNA', 'CNA', 'per_diem',
     now() + interval '2 days' + interval '7 hours', now() + interval '2 days' + interval '19 hours',
     22, 26, 'hour', 2, true, 'open', 'Day shift, 12h. Med-surg floor.'),
    (t, 'AdventHealth Tampa', 'Tampa', 'RN', 'RN', 'travel',
     now() + interval '3 days' + interval '19 hours', now() + interval '4 days' + interval '7 hours',
     48, 58, 'hour', 1, true, 'open', 'Med-surg / tele, 13-week contract, nights.'),
    (t, 'Baptist Health', 'Jacksonville', 'LPN', 'LPN', 'contract',
     now() + interval '2 days' + interval '15 hours', now() + interval '2 days' + interval '23 hours',
     30, 36, 'hour', 1, true, 'open', 'Evening shift, skilled nursing wing.');

  -- Facility/client side: a client and an open staff request
  insert into public.clients (tenant_id, name, contact_name, contact_email, city)
  values (t, 'Sunrise SNF', 'Pat Lee', 'pat@sunrisesnf.example', 'Tampa');

  insert into public.staff_requests
    (tenant_id, facility_name, requester_name, requester_email, city, role, required_credential, employment_type, headcount, start_date, status)
  values
    (t, 'Sunrise SNF', 'Pat Lee', 'pat@sunrisesnf.example', 'Tampa', 'CNA', 'CNA', 'per_diem', 3, current_date + 5, 'new');

  -- A saved search with alerts on (exercises the job-alerts poll)
  insert into public.saved_searches (caregiver_id, tenant_id, label, filters, notify)
  values (cg_dana, t, 'CNA · Orlando · Per diem', '{"role":"CNA","city":"Orlando","type":"per_diem"}'::jsonb, true);

  raise notice 'Seeded demo data for complete-staffing.';
end $$;
