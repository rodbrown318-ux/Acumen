import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { log } from "../_shared/logger.ts";

/**
 * Market insights (Aya Index-style). Public, read-only aggregate stats over a
 * tenant's open public shifts: totals, breakdown by role with average pay, and
 * cities hiring. No PII. Tenant comes from a ?tenant=<slug> query param.
 *
 *   GET /functions/v1/insights?tenant=complete-staffing
 *     -> { ok, tenant, totalOpen, cities, byRole: [...] }
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return json({ ok: false, error: "This endpoint only supports GET." }, 405);
  }

  const slug = new URL(req.url).searchParams.get("tenant");
  if (!slug) return json({ ok: false, error: "Missing required 'tenant' query parameter." }, 400);

  try {
    const client = getServiceClient();
    const { data: tenant, error: tErr } = await client
      .from("tenants").select("id, slug").eq("slug", slug).maybeSingle();
    if (tErr) throw tErr;
    if (!tenant) return json({ ok: false, error: `Unknown tenant: ${slug}` }, 404);

    const { data, error } = await client
      .from("shifts")
      .select("role_required, city, pay_rate_min, pay_rate_max")
      .eq("tenant_id", tenant.id)
      .eq("status", "open")
      .eq("is_public", true);
    if (error) throw error;

    const rows = data ?? [];
    const byRoleMap = new Map<string, { count: number; minSum: number; maxSum: number; payCount: number }>();
    const cities = new Set<string>();

    for (const r of rows) {
      const role = r.role_required as string;
      if (r.city) cities.add(r.city as string);
      const agg = byRoleMap.get(role) ?? { count: 0, minSum: 0, maxSum: 0, payCount: 0 };
      agg.count += 1;
      const lo = r.pay_rate_min as number | null;
      const hi = r.pay_rate_max as number | null;
      if (lo != null && hi != null) {
        agg.minSum += lo;
        agg.maxSum += hi;
        agg.payCount += 1;
      }
      byRoleMap.set(role, agg);
    }

    const byRole = Array.from(byRoleMap.entries())
      .map(([role, a]) => ({
        role,
        openings: a.count,
        avgPayMin: a.payCount ? round1(a.minSum / a.payCount) : null,
        avgPayMax: a.payCount ? round1(a.maxSum / a.payCount) : null,
      }))
      .sort((x, y) => y.openings - x.openings);

    log("operations", "insights_served", { tenant: slug, totalOpen: rows.length });
    return json({ ok: true, tenant: slug, totalOpen: rows.length, cities: cities.size, byRole });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "insights_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
