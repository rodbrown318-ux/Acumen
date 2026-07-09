import { createAgentHandler } from "../_shared/handler.ts";
import { buildFunnel, getFunnelPerformance } from "./funnels.ts";

/**
 * Marketing agent: content/campaign generation, brand voice, and the
 * Marketing Funnels capability (see funnels.ts). Business-specific behavior
 * lives in integrations/<business>/marketing.config.json.
 */
const handler = createAgentHandler("marketing", {
  ping: async () => ({ status: "ok" }),
  buildFunnel,
  getFunnelPerformance,
});

Deno.serve(handler);
