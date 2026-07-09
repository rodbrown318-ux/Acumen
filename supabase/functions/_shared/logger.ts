import { AgentName } from "./types.ts";

/** Structured JSON logging so every agent's logs are uniformly shaped in Supabase's log explorer. */
export function log(
  agent: AgentName,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({
    agent,
    event,
    ts: new Date().toISOString(),
    ...fields,
  }));
}
