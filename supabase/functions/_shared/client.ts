import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Service-role client for an agent's own database access (tenant tables,
 * agent memory, logs). Every agent shares this factory so credentials and
 * connection setup live in exactly one place.
 */
export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the function's environment.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
