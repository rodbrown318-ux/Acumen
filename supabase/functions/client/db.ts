import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { AuthUser } from "../_shared/userAuth.ts";
import { ClientContext, ClientRequest, DirectoryCaregiver } from "./types.ts";

/**
 * Resolve the signed-in user to a client (facility) they can act as, or to an
 * agency admin previewing the portal. Returns null if the user is neither —
 * the caller then returns 403, which is what "locked down" means here.
 */
export async function resolveClient(
  client: SupabaseClient,
  auth: AuthUser,
): Promise<ClientContext | null> {
  const { data: c, error: cErr } = await client
    .from("clients")
    .select("id, tenant_id, name, city")
    .eq("auth_user_id", auth.id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (c) {
    return {
      id: c.id as string,
      tenantId: c.tenant_id as string,
      name: c.name as string,
      city: (c.city as string | null) ?? null,
      via: "client",
    };
  }

  // Not a client — allow an agency admin to preview the directory (scoped to
  // their tenant). Everyone else is unauthorized.
  const { data: a, error: aErr } = await client
    .from("admins")
    .select("id, tenant_id, email")
    .eq("auth_user_id", auth.id)
    .maybeSingle();
  if (aErr) throw aErr;
  if (a) {
    return {
      id: a.id as string,
      tenantId: a.tenant_id as string,
      name: (a.email as string | null) ?? "Agency admin",
      city: null,
      via: "admin",
    };
  }

  return null;
}

/**
 * The verified-caregiver directory for a tenant. A caregiver appears only when
 * they are active, have not opted out, and hold at least one credential the
 * agency has verified and that has not expired. Returns no contact details —
 * clients reach caregivers through the agency (Request Staff), so the directory
 * never exposes PII.
 */
export async function listVerifiedCaregivers(
  client: SupabaseClient,
  tenantId: string,
): Promise<DirectoryCaregiver[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("caregiver_credentials")
    // Single string literal (no concatenation): postgrest-js parses the select
    // as a template-literal type to shape `data`; a concatenated `string` loses
    // that and the rows degrade to GenericStringError.
    .select(
      "credential_type, expires_at, caregivers!inner(id, full_name, profession, specialty, experience_years, tenant_id, is_active, directory_opt_out)",
    )
    .eq("verification_status", "verified")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .eq("caregivers.tenant_id", tenantId)
    .eq("caregivers.is_active", true)
    .eq("caregivers.directory_opt_out", false)
    .limit(1000);
  if (error) throw error;

  // Group verified credentials by caregiver.
  const byCaregiver = new Map<string, DirectoryCaregiver>();
  for (const row of data ?? []) {
    // Embedded to-one row comes back as an object (or an array, depending on
    // the client version) — normalize to a single caregiver record. Double-cast
    // via `unknown` like the other embedded-select consumers (alerts/db.ts),
    // since the parsed embed type doesn't overlap this shape directly.
    const cg = (Array.isArray(row.caregivers) ? row.caregivers[0] : row.caregivers) as unknown as
      | {
        id: string;
        full_name: string;
        profession: string | null;
        specialty: string | null;
        experience_years: number | null;
      }
      | null
      | undefined;
    if (!cg) continue;

    let entry = byCaregiver.get(cg.id);
    if (!entry) {
      entry = {
        id: cg.id,
        name: cg.full_name,
        profession: cg.profession ?? null,
        specialty: cg.specialty ?? null,
        experienceYears: cg.experience_years ?? null,
        verified: true,
        verifiedCredentials: [],
      };
      byCaregiver.set(cg.id, entry);
    }
    const cred = row.credential_type as string;
    if (cred && !entry.verifiedCredentials.includes(cred)) {
      entry.verifiedCredentials.push(cred);
    }
  }

  return [...byCaregiver.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The staff requests this client can see: their own when signed in as a client,
 * or the whole tenant's when an admin is previewing.
 */
export async function listClientRequests(
  client: SupabaseClient,
  ctx: ClientContext,
): Promise<ClientRequest[]> {
  // Apply filters before order()/limit(): those return a transform builder
  // that no longer exposes .eq(), so the client_id filter must come first.
  let query = client
    .from("staff_requests")
    .select("id, facility_name, role, headcount, city, status, created_at")
    .eq("tenant_id", ctx.tenantId);
  if (ctx.via === "client") query = query.eq("client_id", ctx.id);

  const { data, error } = await query
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
    createdAt: r.created_at as string,
  }));
}
