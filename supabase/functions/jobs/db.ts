import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { JobFilters, PublicJob, PublicTenant } from "./types.ts";

// The only columns that may leave the service boundary for a public caller.
// Kept as an explicit whitelist (not `*`) so a future column can't leak by
// accident.
const PUBLIC_COLUMNS =
  "id, client_site, city, role_required, required_credential, employment_type, start_time, end_time, pay_rate_min, pay_rate_max, pay_period, public_summary";

/**
 * Resolve a tenant from a public `?tenant=` slug. Unlike the header-based
 * resolveTenant() used by authenticated agents, this is for anonymous
 * candidates browsing the board, so it returns null instead of throwing on an
 * unknown slug (the caller renders a clean 404).
 */
export async function resolveTenantBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<PublicTenant | null> {
  const { data, error } = await client
    .from("tenants")
    .select("id, slug, display_name")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, slug: data.slug, displayName: data.display_name };
}

/**
 * Open, publicly-visible shifts for one tenant, newest start first, with
 * optional case-insensitive filters. Only `status = 'open'` and
 * `is_public = true` rows are ever returned -- offered/filled shifts and any
 * shift a human has hidden stay off the board.
 */
export async function getPublicOpenShifts(
  client: SupabaseClient,
  tenantId: string,
  filters: JobFilters = {},
  limit = 200,
): Promise<PublicJob[]> {
  let query = client
    .from("shifts")
    .select(PUBLIC_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .eq("is_public", true)
    .order("start_time", { ascending: true })
    .limit(limit);

  if (filters.role) query = query.ilike("role_required", `%${filters.role}%`);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.credential) query = query.ilike("required_credential", `%${filters.credential}%`);
  if (filters.employmentType) query = query.eq("employment_type", filters.employmentType);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    facility: row.client_site as string,
    city: (row.city as string | null) ?? null,
    role: row.role_required as string,
    credential: row.required_credential as string,
    employmentType: (row.employment_type as string | null) ?? null,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    payRateMin: (row.pay_rate_min as number | null) ?? null,
    payRateMax: (row.pay_rate_max as number | null) ?? null,
    payPeriod: (row.pay_period as string | null) ?? null,
    summary: (row.public_summary as string | null) ?? null,
  }));
}
