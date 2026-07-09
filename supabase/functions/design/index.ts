import { createAgentHandler } from "../_shared/handler.ts";

/**
 * Design agent: brand asset generation, layout/creative requests, style
 * guide enforcement. Business-specific behavior lives in
 * integrations/<business>/design.config.json.
 */
const handler = createAgentHandler("design", {
  ping: async () => ({ status: "ok" }),
});

Deno.serve(handler);
