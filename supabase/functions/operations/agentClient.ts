import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";
import { CandidateCaregiver, Shift } from "./types.ts";

// This implements the agent's tool-use loop by hand against the Anthropic
// Messages API, rather than the `@anthropic-ai/claude-agent-sdk` package.
// That package assumes a long-lived Node process (it can shell out to the
// Claude Code CLI); Supabase Edge Functions are stateless, sandboxed Deno
// isolates with no subprocess support, so it can't run there. The tool
// definition below is the same shape a real MCP tool would expose --
// Claude is still the one making the judgment call, this is just the
// edge-runtime-compatible way of wiring it up.

const SELECT_TOOL_NAME = "select_best_caregiver";

const selectCaregiverTool: Anthropic.Tool = {
  name: SELECT_TOOL_NAME,
  description:
    "Select the best-matched caregiver for this shift from the pre-filtered candidate list, or return no_match if none are suitable.",
  input_schema: {
    type: "object",
    properties: {
      caregiverId: {
        type: "string",
        description: "The id of the chosen caregiver, or 'no_match' if none of the candidates should be offered this shift.",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of why this caregiver was chosen over the others.",
      },
    },
    required: ["caregiverId", "reasoning"],
  },
};

export interface MatchDecision {
  caregiverId: string | null;
  reasoning: string;
}

/**
 * Asks Claude to pick the best candidate for a shift out of a deterministic
 * candidate list (already filtered for credential + availability +
 * conflicts). Candidates are all technically eligible, so this is a ranking
 * judgment call -- e.g. weighing credential margin, how recently a caregiver
 * last worked (fairness), tenure -- exactly the kind of decision worth
 * delegating to the agent rather than hand-coding a scoring formula.
 */
export async function selectBestCaregiver(
  shift: Shift,
  candidates: CandidateCaregiver[],
): Promise<MatchDecision> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY in the function's environment.");
  }

  if (candidates.length === 0) {
    return { caregiverId: null, reasoning: "No eligible candidates passed the credential/availability/conflict filter." };
  }
  if (candidates.length === 1) {
    return { caregiverId: candidates[0].id, reasoning: "Only one eligible candidate passed the filter." };
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools: [selectCaregiverTool],
    tool_choice: { type: "tool", name: SELECT_TOOL_NAME },
    system:
      "You are the Operations Agent for a staffing business. Given an open shift and a " +
      "pre-filtered list of eligible caregivers, choose the single best match. All " +
      "candidates already meet the credential, availability, and no-conflict requirements " +
      "-- your job is to break the tie sensibly (e.g. prefer a caregiver whose credential " +
      "isn't close to expiring, and prefer spreading hours fairly across caregivers rather " +
      "than always picking the same person). If nothing about the data distinguishes them, " +
      "picking the first candidate is fine.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          shift: {
            clientSite: shift.client_site,
            roleRequired: shift.role_required,
            requiredCredential: shift.required_credential,
            startTime: shift.start_time,
            endTime: shift.end_time,
          },
          candidates: candidates.map((c) => ({
            caregiverId: c.id,
            fullName: c.full_name,
            credentialExpiresAt: c.matchingCredential.expires_at,
          })),
        }),
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Agent did not return a tool_use block for select_best_caregiver.");
  }

  const input = toolUse.input as { caregiverId: string; reasoning: string };
  return {
    caregiverId: input.caregiverId === "no_match" ? null : input.caregiverId,
    reasoning: input.reasoning,
  };
}
