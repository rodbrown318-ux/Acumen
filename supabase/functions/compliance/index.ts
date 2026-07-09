import { createAgentHandler } from "../_shared/handler.ts";

/**
 * Compliance agent: policy/regulation checks, document/certification tracking,
 * audit trail generation. Business-specific rules live in
 * integrations/<business>/compliance.config.json.
 */
const handler = createAgentHandler("compliance", {
  ping: async () => ({ status: "ok" }),
});

Deno.serve(handler);
