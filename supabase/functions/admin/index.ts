import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { getAuthUser } from "../_shared/userAuth.ts";
import { log } from "../_shared/logger.ts";
import {
  getAdminByAuthUserId,
  getOverview,
  listApplications,
  listCaregivers,
  listStaffRequests,
} from "./db.ts";

/**
 * Authenticated admin API — the live data behind the recruiter console.
 * Requires a Supabase Auth JWT (Authorization: Bearer) that resolves to a row
 * in `admins`; everything returned is scoped to that admin's tenant, so it is
 * multi-tenant safe. Not public: a valid JWT that isn't an admin gets 403.
 *
 *   GET /functions/v1/admin?resource=overview|applications|requests|caregivers
 *   (with Authorization: Bearer <access_token>)
 *
 * Bootstrapping the first admin: create a Supabase Auth user, then insert a row
 * into `admins` (tenant_id, auth_user_id, email, role='owner').
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return json({ ok: false, error: "This endpoint only supports GET." }, 405);
  }

  try {
    const client = getServiceClient();
    const auth = await getAuthUser(req, client);
    if (!auth) return json({ ok: false, error: "Not signed in." }, 401);

    const admin = await getAdminByAuthUserId(client, auth.id);
    if (!admin) return json({ ok: false, error: "Not authorized for admin access." }, 403);

    const resource = new URL(req.url).searchParams.get("resource") ?? "overview";
    let data: unknown;
    switch (resource) {
      case "overview":
        data = await getOverview(client, admin.tenantId);
        break;
      case "applications":
        data = await listApplications(client, admin.tenantId);
        break;
      case "requests":
        data = await listStaffRequests(client, admin.tenantId);
        break;
      case "caregivers":
        data = await listCaregivers(client, admin.tenantId);
        break;
      default:
        return json({ ok: false, error: `Unknown resource '${resource}'.` }, 400);
    }

    log("operations", "admin_api", { adminId: admin.id, tenant: admin.tenantId, resource });
    return json({ ok: true, resource, role: admin.role, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "admin_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
