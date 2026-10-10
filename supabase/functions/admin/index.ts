import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { getAuthUser } from "../_shared/userAuth.ts";
import { log } from "../_shared/logger.ts";
import {
  getAdminByAuthUserId,
  getOverview,
  listApplications,
  listCaregivers,
  listPendingCredentials,
  listStaffRequests,
  verifyCredential,
} from "./db.ts";

/**
 * Authenticated admin API — the live data behind the recruiter console.
 * Requires a Supabase Auth JWT (Authorization: Bearer) that resolves to a row
 * in `admins`; everything returned is scoped to that admin's tenant, so it is
 * multi-tenant safe. Not public: a valid JWT that isn't an admin gets 403.
 *
 *   GET /functions/v1/admin?resource=overview|applications|requests|caregivers|pendingCredentials
 *   (with Authorization: Bearer <access_token>)
 *
 * Credential review (the source of the client-facing verified directory):
 *   POST /functions/v1/admin
 *   { "action": "verifyCredential", "credentialId": "...",
 *     "decision": "verified" | "rejected", "reason": "optional, for rejected" }
 *   Owner/admin only — recruiters are read-only for now.
 *
 * Bootstrapping the first admin: create a Supabase Auth user, then insert a row
 * into `admins` (tenant_id, auth_user_id, email, role='owner').
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ ok: false, error: "This endpoint only supports GET and POST." }, 405);
  }

  try {
    const client = getServiceClient();
    const auth = await getAuthUser(req, client);
    if (!auth) return json({ ok: false, error: "Not signed in." }, 401);

    const admin = await getAdminByAuthUserId(client, auth.id);
    if (!admin) return json({ ok: false, error: "Not authorized for admin access." }, 403);

    if (req.method === "POST") return await handleMutation(client, admin, req);

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
      case "pendingCredentials":
        data = await listPendingCredentials(client, admin.tenantId);
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

interface MutationBody {
  action?: string;
  credentialId?: string;
  decision?: string;
  reason?: string;
}

async function handleMutation(
  client: ReturnType<typeof getServiceClient>,
  admin: Awaited<ReturnType<typeof getAdminByAuthUserId>>,
  req: Request,
): Promise<Response> {
  if (!admin) return json({ ok: false, error: "Not authorized for admin access." }, 403);
  // Verifying credentials is owner/admin only; recruiters are read-only for now.
  if (admin.role !== "owner" && admin.role !== "admin") {
    return json({ ok: false, error: "Your role cannot verify credentials." }, 403);
  }

  let body: MutationBody;
  try {
    body = await req.json() as MutationBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  if (body.action !== "verifyCredential") {
    return json({ ok: false, error: `Unknown action '${body.action ?? ""}'.` }, 400);
  }
  const credentialId = body.credentialId?.trim();
  if (!credentialId) {
    return json({ ok: false, error: "Missing 'credentialId'." }, 400);
  }
  // Narrow to the literal union so the typed verifyCredential call is sound.
  const decision = body.decision === "verified"
    ? "verified"
    : body.decision === "rejected"
    ? "rejected"
    : null;
  if (!decision) {
    return json({ ok: false, error: "'decision' must be 'verified' or 'rejected'." }, 400);
  }

  const result = await verifyCredential(
    client,
    admin,
    credentialId,
    decision,
    body.reason?.trim() || null,
  );
  log("operations", "credential_review", {
    adminId: admin.id,
    tenant: admin.tenantId,
    credentialId: result.id,
    decision: result.status,
  });
  return json({ ok: true, action: "verifyCredential", role: admin.role, result });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
