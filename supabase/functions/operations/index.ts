import { createAgentHandler } from "../_shared/handler.ts";

/**
 * Operations agent: scheduling, task dispatch, vendor/workflow coordination.
 * Business-specific behavior lives in integrations/<business>/operations.config.json.
 */
const handler = createAgentHandler("operations", {
  ping: async () => ({ status: "ok" }),
});

Deno.serve(handler);
