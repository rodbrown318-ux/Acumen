import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TenantContext } from "../_shared/types.ts";
import { createOffer, getCandidateCaregivers, recordDecision } from "./db.ts";
import { selectBestCaregiver } from "./agentClient.ts";
import { sendShiftOfferEmail } from "./email.ts";
import { Shift } from "./types.ts";

export interface MatchConfig {
  offerWindowMinutes: number;
  respondUrl: string;
}

export type MatchOutcome =
  | { status: "offered"; caregiverId: string }
  | { status: "no_candidates" }
  | { status: "no_match" };

/**
 * Finds the best caregiver for a single unfilled shift and sends the offer.
 * Every outcome -- including "nobody eligible" -- is written to
 * agent_decisions so there's a full audit trail of what the agent tried.
 */
export async function matchShift(
  client: SupabaseClient,
  tenant: TenantContext,
  shift: Shift,
  config: MatchConfig,
): Promise<MatchOutcome> {
  const candidates = await getCandidateCaregivers(client, tenant, shift);

  if (candidates.length === 0) {
    await recordDecision(client, tenant, {
      decisionType: "no_candidates",
      subjectType: "shift",
      subjectId: shift.id,
      summary: `No eligible caregivers found for shift at ${shift.client_site} (${shift.required_credential} required).`,
    });
    return { status: "no_candidates" };
  }

  const decision = await selectBestCaregiver(shift, candidates);

  if (!decision.caregiverId) {
    await recordDecision(client, tenant, {
      decisionType: "no_match",
      subjectType: "shift",
      subjectId: shift.id,
      summary: `Agent found ${candidates.length} candidate(s) but selected none.`,
      reasoning: decision.reasoning,
    });
    return { status: "no_match" };
  }

  const caregiver = candidates.find((c) => c.id === decision.caregiverId);
  if (!caregiver) {
    throw new Error(`Agent selected caregiver ${decision.caregiverId}, which is not in the candidate list.`);
  }

  const expiresAt = new Date(Date.now() + config.offerWindowMinutes * 60 * 1000);
  const offer = await createOffer(client, shift, caregiver.id, expiresAt);

  await sendShiftOfferEmail(caregiver, shift, config.respondUrl, offer.response_token);

  await recordDecision(client, tenant, {
    decisionType: "offer_sent",
    subjectType: "shift",
    subjectId: shift.id,
    summary: `Offered shift at ${shift.client_site} to ${caregiver.full_name}.`,
    reasoning: decision.reasoning,
  });

  return { status: "offered", caregiverId: caregiver.id };
}
