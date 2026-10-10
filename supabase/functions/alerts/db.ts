import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TenantContext } from "../_shared/types.ts";

export interface NotifiableSearch {
  id: string;
  caregiverId: string;
  caregiverName: string;
  caregiverEmail: string;
  label: string;
  filters: Record<string, unknown>;
}

export interface MatchedShift {
  id: string;
  role: string;
  facility: string;
  city: string | null;
  payRateMin: number | null;
  payRateMax: number | null;
  startTime: string;
}

/** Saved searches with alerts on, joined to their caregiver's contact info. */
export async function getNotifiableSearches(
  client: SupabaseClient,
  tenant: TenantContext,
): Promise<NotifiableSearch[]> {
  const { data, error } = await client
    .from("saved_searches")
    .select("id, filters, label, caregiver:caregivers!inner(id, full_name, email)")
    .eq("tenant_id", tenant.tenantId)
    .eq("notify", true);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const c = row.caregiver as unknown as { id: string; full_name: string; email: string };
    return {
      id: row.id as string,
      caregiverId: c.id,
      caregiverName: c.full_name,
      caregiverEmail: c.email,
      label: row.label as string,
      filters: (row.filters as Record<string, unknown>) ?? {},
    };
  });
}

// A stored filter value that means "no constraint".
function active(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === "all") return null;
  return s;
}

/** Open, public shifts matching a saved search's filters. */
export async function getMatchingOpenShifts(
  client: SupabaseClient,
  tenant: TenantContext,
  filters: Record<string, unknown>,
): Promise<MatchedShift[]> {
  let query = client
    .from("shifts")
    .select("id, role_required, client_site, city, pay_rate_min, pay_rate_max, start_time")
    .eq("tenant_id", tenant.tenantId)
    .eq("status", "open")
    .eq("is_public", true);

  const role = active(filters.role);
  const city = active(filters.city);
  const type = active(filters.type ?? filters.employmentType);
  const credential = active(filters.credential);
  if (role) query = query.eq("role_required", role);
  if (city) query = query.ilike("city", `%${city}%`);
  if (type) query = query.eq("employment_type", type);
  if (credential) query = query.eq("required_credential", credential);

  const { data, error } = await query.order("start_time", { ascending: true }).limit(50);
  if (error) throw error;

  return (data ?? []).map((s) => ({
    id: s.id as string,
    role: s.role_required as string,
    facility: s.client_site as string,
    city: (s.city as string | null) ?? null,
    payRateMin: (s.pay_rate_min as number | null) ?? null,
    payRateMax: (s.pay_rate_max as number | null) ?? null,
    startTime: s.start_time as string,
  }));
}

/** Shift ids already alerted for a given saved search (dedupe). */
export async function getAlreadyAlerted(
  client: SupabaseClient,
  savedSearchId: string,
): Promise<Set<string>> {
  const { data, error } = await client
    .from("job_alerts_sent")
    .select("shift_id")
    .eq("saved_search_id", savedSearchId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.shift_id as string));
}

export async function recordAlertsSent(
  client: SupabaseClient,
  savedSearchId: string,
  shiftIds: string[],
): Promise<void> {
  if (!shiftIds.length) return;
  const rows = shiftIds.map((id) => ({ saved_search_id: savedSearchId, shift_id: id }));
  const { error } = await client.from("job_alerts_sent").insert(rows);
  if (error) throw error;
}

export async function recordDecision(
  client: SupabaseClient,
  tenant: TenantContext,
  params: { subjectId: string; summary: string },
): Promise<void> {
  const { error } = await client.from("agent_decisions").insert({
    tenant_id: tenant.tenantId,
    agent: "operations",
    decision_type: "job_alert_sent",
    subject_type: "saved_search",
    subject_id: params.subjectId,
    summary: params.summary,
  });
  if (error) throw error;
}
