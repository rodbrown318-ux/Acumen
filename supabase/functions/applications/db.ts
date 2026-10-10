import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TenantContext } from "../_shared/types.ts";
import { Application, ApplicationInput } from "./types.ts";

/** Resolve a tenant from the public form's slug (returns null, doesn't throw). */
export async function resolveTenantBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<TenantContext | null> {
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
 * If the application names a shift, fetch the minimal public detail a recruiter
 * needs in the alert (and to confirm the shift belongs to this tenant). Returns
 * null for a general application or an unknown/foreign shift id.
 */
export async function getShiftBrief(
  client: SupabaseClient,
  tenant: TenantContext,
  shiftId: string,
): Promise<{ id: string; client_site: string; city: string | null; role_required: string } | null> {
  const { data, error } = await client
    .from("shifts")
    .select("id, client_site, city, role_required")
    .eq("id", shiftId)
    .eq("tenant_id", tenant.tenantId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function insertApplication(
  client: SupabaseClient,
  tenant: TenantContext,
  input: ApplicationInput,
  shiftId: string | null,
): Promise<Application> {
  const { data, error } = await client
    .from("applications")
    .insert({
      tenant_id: tenant.tenantId,
      shift_id: shiftId,
      first_name: input.firstName,
      phone: input.phone,
      email: input.email ?? null,
      role: input.role ?? null,
      source: input.source ?? "job_board",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Application;
}

/** Audit trail, mirroring operations' recordDecision so every agent logs alike. */
export async function recordDecision(
  client: SupabaseClient,
  tenant: TenantContext,
  params: {
    decisionType: string;
    subjectType: string;
    subjectId: string;
    summary: string;
    reasoning?: unknown;
  },
): Promise<void> {
  const { error } = await client.from("agent_decisions").insert({
    tenant_id: tenant.tenantId,
    agent: "operations",
    decision_type: params.decisionType,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    summary: params.summary,
    reasoning: params.reasoning ?? null,
  });
  if (error) throw error;
}
