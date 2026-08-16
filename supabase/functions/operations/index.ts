import { createAgentHandler } from "../_shared/handler.ts";
import { getMatchConfig } from "./config.ts";
import { pollShifts } from "./poll.ts";
import { handleRespond } from "./respond.ts";
import { getServiceClient } from "../_shared/client.ts";
import { FulfillInput, fulfillStaffRequest } from "./staffRequests.ts";

/**
 * Operations agent: shift/caregiver matching.
 *
 * Two entry points share this one Edge Function:
 *  - `POST /` with the standard {action, payload} envelope (ping, and
 *    pollShifts -- called every 15 minutes by the pg_cron job in
 *    supabase/migrations/20260709020000_operations_agent_cron.sql).
 *  - `GET /respond?token=...&decision=accept|decline` -- the public,
 *    unauthenticated link a caregiver clicks from their offer email.
 *    Deliberately bypasses createAgentHandler's tenant-header requirement
 *    since the caller here is an external caregiver, not a business
 *    system integration.
 */
const agentHandler = createAgentHandler("operations", {
  ping: async () => ({ status: "ok" }),
  pollShifts: async ({ tenant }) => {
    const client = getServiceClient();
    return await pollShifts(client, tenant, getMatchConfig());
  },
  // Approve a staff request -> open shifts (facility side closes into the
  // caregiver side; the next poll matches them).
  fulfillStaffRequest: async ({ tenant, payload }) => {
    const client = getServiceClient();
    return await fulfillStaffRequest(client, tenant, payload as FulfillInput);
  },
});

Deno.serve((req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/respond")) {
    return handleRespond(req);
  }
  return agentHandler(req);
});
