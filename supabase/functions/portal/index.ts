import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { getAuthUser } from "../_shared/userAuth.ts";
import { log } from "../_shared/logger.ts";
import { buildPortalSummary, resolveCaregiver } from "./db.ts";

/**
 * Candidate portal home (roadmap Tier 4 #15). Returns a caregiver's profile
 * completeness, "get ready" task list, upcoming assignments, and saved
 * searches -- all derived from rows the Operations agent already maintains.
 *
 * Auth, two ways (checked in order):
 *   1. Real login — `Authorization: Bearer <supabase access_token>`, resolved
 *      to the caregiver via auth_user_id. This is the production path.
 *   2. Legacy magic link — `?token=<caregiver.portal_token>`, kept working for
 *      the existing flow/prototypes.
 *
 *   GET /functions/v1/portal            (with Authorization header), or
 *   GET /functions/v1/portal?token=...  -> { ok, portal: PortalSummary }
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return json({ ok: false, error: "This endpoint only supports GET." }, 405);
  }

  const token = new URL(req.url).searchParams.get("token");

  try {
    const client = getServiceClient();
    const auth = await getAuthUser(req, client);
    const caregiver = await resolveCaregiver(client, auth, token);
    if (!caregiver) {
      return json({ ok: false, error: "Not signed in, or invalid portal link." }, 401);
    }

    const portal = await buildPortalSummary(client, caregiver);
    log("operations", "portal_loaded", {
      caregiverId: caregiver.id,
      profileComplete: `${portal.profile.complete}/${portal.profile.total}`,
    });
    return json({ ok: true, portal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "portal_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
