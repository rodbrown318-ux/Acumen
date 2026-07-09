import { PollConfig } from "./poll.ts";

/**
 * Every value the Operations Agent needs beyond Supabase/Anthropic/Resend
 * credentials comes from environment variables set per Supabase project
 * deployment. To onboard a new business: deploy this same function to that
 * business's Supabase project and set these secrets to its values -- no
 * code changes.
 */
export function getMatchConfig(): PollConfig {
  const escalationEmail = Deno.env.get("OPERATIONS_ESCALATION_EMAIL");
  if (!escalationEmail) {
    throw new Error("Missing OPERATIONS_ESCALATION_EMAIL in the function's environment.");
  }

  const offerWindowMinutes = Number(Deno.env.get("OPERATIONS_OFFER_WINDOW_MINUTES") ?? "30");
  const escalationHoursBeforeStart = Number(Deno.env.get("OPERATIONS_ESCALATION_HOURS") ?? "4");

  return {
    escalationEmail,
    offerWindowMinutes,
    escalationHoursBeforeStart,
    respondUrl: getRespondUrl(),
  };
}

function getRespondUrl(): string {
  const override = Deno.env.get("OPERATIONS_PUBLIC_URL");
  if (override) return override;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL in the function's environment.");
  }
  return `${supabaseUrl}/functions/v1/operations/respond`;
}
