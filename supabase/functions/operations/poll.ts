import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TenantContext } from "../_shared/types.ts";
import {
  expireOffer,
  getExpiredPendingOffers,
  getShiftsNeedingEscalation,
  getUnfilledShifts,
  markShiftEscalated,
  recordDecision,
  reopenShift,
} from "./db.ts";
import { matchShift, MatchConfig } from "./matching.ts";
import { sendEscalationAlert } from "./email.ts";

export interface PollConfig extends MatchConfig {
  escalationEmail: string;
  escalationHoursBeforeStart: number;
}

export interface PollSummary {
  expiredOffers: number;
  matchAttempts: number;
  offersSent: number;
  escalations: number;
}

/**
 * The 15-minute cycle: expire stale offers (which reopens those shifts),
 * try to match every currently-unfilled shift, then alert on anything
 * still open within the escalation window. Runs to completion even if one
 * shift fails so a single bad row can't block the whole tenant's poll.
 */
export async function pollShifts(
  client: SupabaseClient,
  tenant: TenantContext,
  config: PollConfig,
): Promise<PollSummary> {
  const summary: PollSummary = { expiredOffers: 0, matchAttempts: 0, offersSent: 0, escalations: 0 };

  const expired = await getExpiredPendingOffers(client, tenant);
  for (const offer of expired) {
    await expireOffer(client, offer.id);
    await reopenShift(client, offer.shift_id);
    await recordDecision(client, tenant, {
      decisionType: "offer_expired",
      subjectType: "shift_offer",
      subjectId: offer.id,
      summary: `Offer for shift ${offer.shift_id} expired with no response; shift reopened for the next match.`,
    });
    summary.expiredOffers++;
  }

  const unfilled = await getUnfilledShifts(client, tenant);
  for (const shift of unfilled) {
    if (shift.status !== "open") continue; // already has a pending offer out
    summary.matchAttempts++;
    try {
      const outcome = await matchShift(client, tenant, shift, config);
      if (outcome.status === "offered") summary.offersSent++;
    } catch (err) {
      await recordDecision(client, tenant, {
        decisionType: "match_error",
        subjectType: "shift",
        subjectId: shift.id,
        summary: `Matching failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const needingEscalation = await getShiftsNeedingEscalation(
    client,
    tenant,
    config.escalationHoursBeforeStart,
  );
  for (const shift of needingEscalation) {
    await sendEscalationAlert(config.escalationEmail, shift);
    await markShiftEscalated(client, shift.id);
    await recordDecision(client, tenant, {
      decisionType: "escalated",
      subjectType: "shift",
      subjectId: shift.id,
      summary: `Alerted ${config.escalationEmail}: shift at ${shift.client_site} unfilled within ${config.escalationHoursBeforeStart}h of start.`,
    });
    summary.escalations++;
  }

  return summary;
}
