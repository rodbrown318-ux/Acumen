import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TenantContext } from "./types.ts";

/**
 * Resolves which business (tenant) is calling an agent.
 *
 * Callers identify their tenant with an `x-tenant-slug` header (e.g.
 * "complete-staffing"). The slug is looked up against the shared `tenants`
 * table so a single agent deployment can serve every business without
 * per-tenant redeploys.
 */
export async function resolveTenant(
  req: Request,
  client: SupabaseClient,
): Promise<TenantContext> {
  const slug = req.headers.get("x-tenant-slug");
  if (!slug) {
    throw new Error("Missing required 'x-tenant-slug' header.");
  }

  const { data, error } = await client
    .from("tenants")
    .select("id, slug, display_name")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    throw new Error(`Unknown tenant slug: ${slug}`);
  }

  return {
    tenantId: data.id,
    tenantSlug: data.slug,
    displayName: data.display_name,
  };
}
