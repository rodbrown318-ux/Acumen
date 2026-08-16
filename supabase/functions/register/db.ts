import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { RegisterInput, TenantRef } from "./types.ts";

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
 * Create a caregiver profile plus any credentials/availability supplied by the
 * wizard. Returns the new caregiver id and its opaque portal_token so the
 * caller can hand the candidate a magic link straight into the portal.
 */
export async function registerCaregiver(
  client: SupabaseClient,
  tenant: TenantRef,
  input: RegisterInput,
): Promise<{ caregiverId: string; portalToken: string; authLinked: boolean }> {
  const { data: caregiver, error } = await client
    .from("caregivers")
    .insert({
      tenant_id: tenant.tenantId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      profession: input.profession ?? null,
      specialty: input.specialty ?? null,
      experience_years: input.experienceYears ?? null,
    })
    .select("id, portal_token")
    .single();
  if (error) throw error;

  const caregiverId = caregiver.id as string;

  // Create a Supabase Auth user so the caregiver can log in (magic link), and
  // link it. Best-effort: if the email already has an account (or auth is
  // misconfigured), we skip — link-by-email on first login still connects them.
  let authLinked = false;
  try {
    const { data: authData, error: authErr } = await client.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
    });
    if (!authErr && authData?.user) {
      await client.from("caregivers").update({ auth_user_id: authData.user.id }).eq("id", caregiverId);
      authLinked = true;
    }
  } catch {
    // ignore — registration still succeeds without the auth link
  }

  if (input.credentials?.length) {
    const rows = input.credentials.map((c) => ({
      caregiver_id: caregiverId,
      credential_type: c.type,
      expires_at: c.expiresAt ?? null,
    }));
    const { error: credErr } = await client.from("caregiver_credentials").insert(rows);
    if (credErr) throw credErr;
  }

  if (input.availability?.length) {
    const rows = input.availability.map((a) => ({
      caregiver_id: caregiverId,
      weekday: a.weekday,
      start_time: a.startTime,
      end_time: a.endTime,
    }));
    const { error: availErr } = await client.from("caregiver_availability").insert(rows);
    if (availErr) throw availErr;
  }

  return { caregiverId, portalToken: caregiver.portal_token as string, authLinked };
}
