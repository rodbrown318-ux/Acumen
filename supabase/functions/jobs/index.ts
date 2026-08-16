import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { log } from "../_shared/logger.ts";
import { getPublicOpenShifts, resolveTenantBySlug } from "./db.ts";
import { JobFilters } from "./types.ts";

/**
 * Public job board: the candidate-facing read surface the marketing site is
 * missing today. It closes the single biggest gap versus larger competitors
 * (e.g. Aya) -- letting a candidate browse open shifts and pay BEFORE handing
 * over their contact info -- while the rest of the funnel stays recruiter-led.
 *
 * Deliberately public and unauthenticated, like operations' `/respond`: the
 * caller is an anonymous job seeker, not a business system, so tenant identity
 * comes from a `?tenant=<slug>` query param instead of an x-tenant-slug header.
 * It never touches caregiver data and only ever returns the whitelisted public
 * columns (see jobs/db.ts).
 *
 *   GET /functions/v1/jobs?tenant=complete-staffing
 *       &role=RN&city=Orlando&credential=RN&type=per_diem
 *     -> { ok, tenant, count, jobs: PublicJob[] }
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);

  if (req.method !== "GET") {
    return json({ ok: false, error: "This endpoint only supports GET." }, 405);
  }

  const slug = url.searchParams.get("tenant");
  if (!slug) {
    return json({ ok: false, error: "Missing required 'tenant' query parameter." }, 400);
  }

  try {
    const client = getServiceClient();
    const tenant = await resolveTenantBySlug(client, slug);
    if (!tenant) {
      return json({ ok: false, error: `Unknown tenant: ${slug}` }, 404);
    }

    const filters: JobFilters = {
      role: url.searchParams.get("role") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      credential: url.searchParams.get("credential") ?? undefined,
      employmentType: url.searchParams.get("type") ?? undefined,
    };

    const jobs = await getPublicOpenShifts(client, tenant.id, filters);
    log("operations", "public_jobs_listed", { tenant: slug, count: jobs.length });

    return json({ ok: true, tenant: tenant.slug, count: jobs.length, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "public_jobs_error", { tenant: slug, error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
