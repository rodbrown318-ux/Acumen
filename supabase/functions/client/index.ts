import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { getAuthUser } from "../_shared/userAuth.ts";
import { log } from "../_shared/logger.ts";
import { listClientRequests, listVerifiedCaregivers, resolveClient } from "./db.ts";

/**
 * Locked-down client (facility) portal.
 *
 * Unlike the public "Request Staff" intake (supabase/functions/staffing), this
 * endpoint requires a real login: a Supabase Auth JWT (Authorization: Bearer)
 * that resolves to a `clients` row via auth_user_id — or to an agency admin
 * previewing. No token fallback, no anonymous access. Everything is scoped to
 * the caller's tenant, so it is multi-tenant safe.
 *
 *   GET /functions/v1/client?resource=directory|requests|me
 *   (with Authorization: Bearer <access_token>)
 *
 * - directory: verified caregivers the client may browse (no contact details).
 * - requests:  the client's own staff requests (tenant-wide for an admin).
 * - me:        the signed-in client's profile.
 *
 * Linking a client to a login (one-time, agency-side): create a Supabase Auth
 * user for the contact, then set clients.auth_user_id to that user's id.
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

    const ctx = await resolveClient(client, auth);
    if (!ctx) return json({ ok: false, error: "Not authorized for client access." }, 403);

    const resource = new URL(req.url).searchParams.get("resource") ?? "directory";
    let data: unknown;
    switch (resource) {
      case "directory":
        data = await listVerifiedCaregivers(client, ctx.tenantId);
        break;
      case "requests":
        data = await listClientRequests(client, ctx);
        break;
      case "me":
        data = { id: ctx.id, name: ctx.name, city: ctx.city, via: ctx.via };
        break;
      default:
        return json({ ok: false, error: `Unknown resource '${resource}'.` }, 400);
    }

    log("operations", "client_portal", { clientId: ctx.id, tenant: ctx.tenantId, via: ctx.via, resource });
    return json({ ok: true, resource, via: ctx.via, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "client_portal_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
