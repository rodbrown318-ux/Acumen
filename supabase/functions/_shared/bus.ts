import { AgentName, AgentResponse, TenantContext } from "./types.ts";
import { log } from "./logger.ts";

/**
 * The communication layer agents use to call one another.
 *
 * Agents are standalone Edge Functions with no direct imports between them —
 * this is the only sanctioned way for one agent to invoke another. It calls
 * the target agent's own HTTP endpoint (service-role authenticated) so every
 * inter-agent call goes through the same auth, tenant-resolution, and
 * logging path as an external request would.
 */
export async function callAgent<TPayload, TResult>(
  from: AgentName,
  to: AgentName,
  tenant: TenantContext,
  action: string,
  payload: TPayload,
  correlationId: string = crypto.randomUUID(),
): Promise<AgentResponse<TResult>> {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!baseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the function's environment.",
    );
  }

  log(from, "agent_call_out", { to, action, correlationId });

  const res = await fetch(`${baseUrl}/functions/v1/${to}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "x-tenant-slug": tenant.tenantSlug,
    },
    body: JSON.stringify({ action, payload, correlationId }),
  });

  const json = await res.json() as AgentResponse<TResult>;

  log(from, "agent_call_in", {
    to,
    action,
    correlationId,
    ok: json.ok,
  });

  return json;
}
