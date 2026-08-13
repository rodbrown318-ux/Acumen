-- Public job board: the candidate-facing surface the site is missing today.
--
-- The Operations agent already models open `shifts`, but those rows carry no
-- pay or city info and nothing marks a shift as safe to show publicly. This
-- migration adds the few columns a public listing needs, WITHOUT exposing any
-- caregiver PII (the public `jobs` Edge Function only ever selects the columns
-- added/whitelisted here). RLS on `shifts` stays as-is: the public endpoint
-- reads through the service-role key server-side, so no anon policy is added.

alter table public.shifts
  add column if not exists city text,
  add column if not exists employment_type text
    check (employment_type in ('per_diem', 'travel', 'contract', 'permanent')),
  add column if not exists pay_rate_min numeric(8, 2),
  add column if not exists pay_rate_max numeric(8, 2),
  add column if not exists pay_period text
    check (pay_period in ('hour', 'shift', 'day', 'week')),
  -- Public listings are opt-out: a shift is browsable unless a human hides it
  -- (e.g. a confidential placement). Filled/offered shifts are excluded by the
  -- endpoint regardless of this flag.
  add column if not exists is_public boolean not null default true,
  -- Short candidate-facing blurb; never contains internal notes.
  add column if not exists public_summary text;

-- A non-negative, well-ordered pay range when pay is shown at all.
alter table public.shifts
  add constraint shifts_pay_range_valid
  check (
    pay_rate_min is null
    or pay_rate_max is null
    or (pay_rate_min >= 0 and pay_rate_max >= pay_rate_min)
  );

-- Index the exact predicate the public board queries: a tenant's open,
-- public shifts ordered by soonest start.
create index if not exists shifts_public_open
  on public.shifts (tenant_id, start_time)
  where status = 'open' and is_public = true;
