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

/**
 * Credentials awaiting the agency's verification decision, tenant-scoped. These
 * are what gate a caregiver into the client-facing directory, so this is the
 * admin's review queue.
 */
export async function listPendingCredentials(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from("caregiver_credentials")
    .select(
      "id, credential_type, expires_at, created_at, " +
        "caregivers!inner(id, full_name, tenant_id)",
    )
    .eq("verification_status", "pending")
    .eq("caregivers.tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const cg = (Array.isArray(row.caregivers) ? row.caregivers[0] : row.caregivers) as
      | { id: string; full_name: string }
      | null;
    return {
      id: row.id as string,
      credentialType: row.credential_type as string,
      expiresAt: (row.expires_at as string | null) ?? null,
      caregiverId: cg?.id ?? null,
      caregiverName: cg?.full_name ?? null,
    };
  });
}

/**
 * Record the agency's verification decision on a credential. Tenant-scoped: the
 * credential must belong to a caregiver in this admin's tenant, or it is
 * treated as not found. 'verified' credentials (non-expired) are what surface a
 * caregiver in the client directory; 'rejected' keeps them out and records why.
 */
export async function verifyCredential(
  client: SupabaseClient,
  admin: AdminContext,
  credentialId: string,
  decision: "verified" | "rejected",
  reason: string | null,
): Promise<{ id: string; status: string; caregiverId: string | null }> {
  const { data: cred, error: findErr } = await client
    .from("caregiver_credentials")
    .select("id, credential_type, caregivers!inner(id, tenant_id)")
    .eq("id", credentialId)
    .maybeSingle();
  if (findErr) throw findErr;
  const cg = cred
    ? ((Array.isArray(cred.caregivers) ? cred.caregivers[0] : cred.caregivers) as
      | { id: string; tenant_id: string }
      | null)
    : null;
  if (!cred || !cg || cg.tenant_id !== admin.tenantId) {
    throw new Error("Credential not found in your tenant.");
  }

  const { error: updErr } = await client
    .from("caregiver_credentials")
    .update({
      verification_status: decision,
      verified_at: decision === "verified" ? new Date().toISOString() : null,
      verified_by: admin.id,
      rejection_reason: decision === "rejected" ? reason : null,
    })
    .eq("id", credentialId);
  if (updErr) throw updErr;

  const { error: logErr } = await client.from("agent_decisions").insert({
    tenant_id: admin.tenantId,
    agent: "operations",
    decision_type: decision === "verified" ? "credential_verified" : "credential_rejected",
    subject_type: "caregiver_credential",
    subject_id: credentialId,
    summary: `${admin.email} ${decision} ${cred.credential_type} credential` +
      (decision === "rejected" && reason ? ` (${reason})` : ""),
  });
  if (logErr) throw logErr;

  return { id: credentialId, status: decision, caregiverId: cg.id };
}
