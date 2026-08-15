import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { log } from "../_shared/logger.ts";
import { buildPortalSummary, getCaregiverByToken } from "./db.ts";

/**
 * Candidate portal home (roadmap Tier 4 #15). Returns a caregiver's profile
 * completeness, "get ready" task list, upcoming assignments, and saved
 * searches -- all derived from rows the Operations agent already maintains.
 *
 * Auth: an opaque per-caregiver `portal_token` in the query string, the same
 * magic-link pattern as operations' /respond. It scopes the response to one
 * caregiver without full end-user auth. Production should move to Supabase
 * Auth JWT and rotate these tokens (see CLAUDE.md runtime notes); until then
 * the portal is deliberately read-only.
 *
 *   GET /functions/v1/portal?token=<caregiver.portal_token>
 *     -> { ok, portal: PortalSummary }
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return json({ ok: false, error: "This endpoint only supports GET." }, 405);
  }

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return json({ ok: false, error: "Missing required 'token' query parameter." }, 400);
  }

  try {
    const client = getServiceClient();
    const caregiver = await getCaregiverByToken(client, token);
    if (!caregiver) {
      // Same response for unknown vs. malformed token -- don't leak which.
      return json({ ok: false, error: "Invalid or expired portal link." }, 404);
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
