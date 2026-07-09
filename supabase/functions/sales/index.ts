import { createAgentHandler } from "../_shared/handler.ts";

/**
 * Sales agent: lead qualification, pipeline updates, quote/proposal drafting.
 * Business-specific behavior lives in integrations/<business>/sales.config.json.
 */
const handler = createAgentHandler("sales", {
  ping: async () => ({ status: "ok" }),
});

Deno.serve(handler);
