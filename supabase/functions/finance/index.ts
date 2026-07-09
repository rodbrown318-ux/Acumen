import { createAgentHandler } from "../_shared/handler.ts";

/**
 * Finance agent: invoicing, expense tracking, payroll summaries, reporting.
 * Business-specific behavior lives in integrations/<business>/finance.config.json.
 */
const handler = createAgentHandler("finance", {
  ping: async () => ({ status: "ok" }),
});

Deno.serve(handler);
