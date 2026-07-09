import { createAgentHandler } from "../_shared/handler.ts";

/**
 * HR agent: onboarding, employee records, time-off, policy Q&A.
 * Business-specific behavior (e.g. Complete Staffing's onboarding checklist)
 * lives in integrations/<business>/hr.config.json, not in this file.
 */
const handler = createAgentHandler("hr", {
  ping: async () => ({ status: "ok" }),
});

Deno.serve(handler);
