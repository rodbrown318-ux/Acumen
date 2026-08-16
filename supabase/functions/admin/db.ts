import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AdminContext {
  id: string;
  tenantId: string;
  role: string;
  email: string;
}

/** Resolve an admin from their Supabase Auth user id (null if not an admin). */
export async function getAdminByAuthUserId(
  client: SupabaseClient,
  userId: string,
): Promise<AdminContext | null> {
  const { data, error } = await client
    .from("admins")
    .select("id, tenant_id, role, email")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, tenantId: data.tenant_id as string, role: data.role as string, email: data.email as string };
}

async function countRows(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getOverview(client: SupabaseClient, tenantId: string) {
  const head = { count: "exact" as const, head: true };
  const [applicants, requests, openShifts, alertsSent] = await Promise.all([
    countRows(client.from("applications").select("*", head).eq("tenant_id", tenantId).eq("status", "new")),
    countRows(client.from("staff_requests").select("*", head).eq("tenant_id", tenantId).in("status", ["new", "reviewing"])),
    countRows(client.from("shifts").select("*", head).eq("tenant_id", tenantId).eq("status", "open")),
    countRows(client.from("agent_decisions").select("*", head).eq("tenant_id", tenantId).eq("decision_type", "job_alert_sent")),
  ]);
  return { applicants, requests, openShifts, alertsSent };
}

export async function listApplications(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from("applications")
    .select("id, first_name, role, phone, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id as string,
    name: a.first_name as string,
    role: (a.role as string | null) ?? null,
    phone: a.phone as string,
    status: a.status as string,
    appliedAt: a.created_at as string,
  }));
}

export async function listStaffRequests(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from("staff_requests")
    .select("id, facility_name, role, headcount, city, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    facility: r.facility_name as string,
    role: r.role as string,
    headcount: r.headcount as number,
    city: (r.city as string | null) ?? null,
    status: r.status as string,
  }));
}

export async function listCaregivers(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from("caregivers")
    .select("id, full_name, profession, specialty, is_active")
    .eq("tenant_id", tenantId)
    .order("full_name", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.full_name as string,
    profession: (c.profession as string | null) ?? null,
    specialty: (c.specialty as string | null) ?? null,
    active: c.is_active as boolean,
  }));
}
