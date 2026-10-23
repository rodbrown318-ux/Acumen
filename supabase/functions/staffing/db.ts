import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { StaffRequestInput, TenantRef } from "./types.ts";

export async function resolveTenantBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<TenantRef | null> {
  const { data, error } = await client
    .from("tenants")
    .select("id, slug, display_name")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { tenantId: data.id, tenantSlug: data.slug, displayName: data.display_name };
}

/**
 * Find the client for this facility name (case-insensitive, per tenant) or
 * create it, so repeat requests from the same facility reuse one record and
 * the agency builds a client list over time.
 */
export async function findOrCreateClient(
  client: SupabaseClient,
  tenant: TenantRef,
  input: StaffRequestInput,
): Promise<string> {
  const { data: existing, error: findErr } = await client
    .from("clients")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .ilike("name", input.facilityName.trim())
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id as string;

  const { data: created, error: insErr } = await client
    .from("clients")
    .insert({
      tenant_id: tenant.tenantId,
      name: input.facilityName.trim(),
      contact_name: input.requesterName,
      contact_email: input.requesterEmail,
      contact_phone: input.requesterPhone ?? null,
      city: input.city ?? null,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return created.id as string;
}

export async function insertStaffRequest(
  client: SupabaseClient,
  tenant: TenantRef,
  clientId: string | null,
  input: StaffRequestInput,
): Promise<string> {
  const { data, error } = await client
    .from("staff_requests")
    .insert({
      tenant_id: tenant.tenantId,
      client_id: clientId,
      facility_name: input.facilityName.trim(),
      requester_name: input.requesterName,
      requester_email: input.requesterEmail,
      requester_phone: input.requesterPhone ?? null,
      city: input.city ?? null,
      role: input.role,
      required_credential: input.credential ?? null,
      employment_type: input.employmentType ?? null,
      headcount: input.headcount ?? 1,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      shift_notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function recordDecision(
  client: SupabaseClient,
  tenant: TenantRef,
  params: { subjectId: string; summary: string },
): Promise<void> {
  const { error } = await client.from("agent_decisions").insert({
    tenant_id: tenant.tenantId,
    agent: "operations",
    decision_type: "staff_request_received",
    subject_type: "staff_request",
    subject_id: params.subjectId,
    summary: params.summary,
  });
  if (error) throw error;
}
