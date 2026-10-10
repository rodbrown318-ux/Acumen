import { corsHeaders, handlePreflight } from "./cors.ts";
import { getServiceClient } from "./client.ts";
import { resolveTenant } from "./auth.ts";
import { log } from "./logger.ts";
import { AgentName, AgentRequest, AgentResponse } from "./types.ts";

// Each action may return its own result shape, so the value type is
// Promise<unknown> rather than a single shared TResult -- otherwise an agent
// with two actions that return different types (e.g. operations' ping vs.
// pollShifts) fails to type-check. The result is only ever JSON-serialized
// into the response envelope, so `unknown` is the right contract here.
export type ActionHandlers<TPayload = unknown> = Record<
  string,
  (req: AgentRequest<TPayload>) => Promise<unknown>
>;

/**
 * Wraps an agent's action map in the request/response boilerplate every
 * agent needs: CORS, tenant resolution, structured logging, and a
 * consistent AgentResponse envelope. Each agent's index.ts only supplies
 * `{ actionName: handlerFn }` — this is what keeps 7 standalone Edge
 * Functions behaving like one coherent system.
 */
export function createAgentHandler<TPayload = unknown>(
  agent: AgentName,
  actions: ActionHandlers<TPayload>,
) {
  return async (req: Request): Promise<Response> => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    try {
      const client = getServiceClient();
      const tenant = await resolveTenant(req, client);
      const { action, payload, correlationId } = await req.json() as {
        action: string;
        payload: TPayload;
        correlationId?: string;
      };

      const handler = actions[action];
      if (!handler) {
        throw new Error(`Unknown action '${action}' for agent '${agent}'.`);
      }

      log(agent, "action_start", { action, tenant: tenant.tenantSlug, correlationId });
      const result = await handler({ tenant, action, payload, correlationId });
      log(agent, "action_ok", { action, tenant: tenant.tenantSlug, correlationId });

      const body: AgentResponse = { ok: true, agent, action, result };
      return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(agent, "action_error", { error: message });

      const body: AgentResponse = {
        ok: false,
        agent,
        action: "unknown",
        error: message,
      };
      return new Response(JSON.stringify(body), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}
