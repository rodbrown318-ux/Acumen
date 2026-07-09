import { getServiceClient } from "../_shared/client.ts";
import { TenantContext } from "../_shared/types.ts";
import { fillShift, getOfferByToken, recordDecision, reopenShift, respondToOffer } from "./db.ts";
import { matchShift } from "./matching.ts";
import { getMatchConfig } from "./config.ts";

const html = (body: string, status = 200) =>
  new Response(`<!doctype html><html><body style="font-family: sans-serif; max-width: 480px; margin: 4rem auto;">${body}</body></html>`, {
    status,
    headers: { "Content-Type": "text/html" },
  });

/**
 * Public, unauthenticated endpoint a caregiver hits by clicking the
 * accept/decline link in their offer email. Tenant identity comes from the
 * offer row itself (via the opaque response_token), not an x-tenant-slug
 * header, since the caller here is an external caregiver, not a business
 * system integration.
 */
export async function handleRespond(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const decision = url.searchParams.get("decision");

  if (!token || (decision !== "accept" && decision !== "decline")) {
    return html("<h1>Invalid link</h1><p>This offer link is missing required parameters.</p>", 400);
  }

  const client = getServiceClient();
  const offer = await getOfferByToken(client, token);

  if (!offer) {
    return html("<h1>Offer not found</h1><p>This link is no longer valid.</p>", 404);
  }
  if (offer.status !== "pending") {
    return html(`<h1>Already responded</h1><p>This offer was already marked "${offer.status}".</p>`);
  }

  const { data: tenantRow, error: tenantErr } = await client
    .from("tenants")
    .select("id, slug, display_name")
    .eq("id", offer.shift.tenant_id)
    .single();
  if (tenantErr || !tenantRow) {
    return html("<h1>Something went wrong</h1><p>Could not resolve the tenant for this offer.</p>", 500);
  }
  const tenant: TenantContext = {
    tenantId: tenantRow.id,
    tenantSlug: tenantRow.slug,
    displayName: tenantRow.display_name,
  };

  if (decision === "accept") {
    await respondToOffer(client, offer.id, "accepted");
    await fillShift(client, offer.shift.id, offer.caregiver_id);
    await recordDecision(client, tenant, {
      decisionType: "offer_accepted",
      subjectType: "shift",
      subjectId: offer.shift.id,
      summary: `${offer.caregiver.full_name} accepted the shift at ${offer.shift.client_site}.`,
    });
    return html(`<h1>Shift confirmed</h1><p>Thanks, ${escapeHtml(offer.caregiver.full_name)} — you're booked for ${offer.shift.client_site}.</p>`);
  }

  // decline: reopen the shift and immediately try the next candidate
  // rather than waiting for the next 15-minute poll.
  await respondToOffer(client, offer.id, "declined");
  await reopenShift(client, offer.shift.id);
  await recordDecision(client, tenant, {
    decisionType: "offer_declined",
    subjectType: "shift",
    subjectId: offer.shift.id,
    summary: `${offer.caregiver.full_name} declined the shift at ${offer.shift.client_site}.`,
  });

  try {
    await matchShift(client, tenant, offer.shift, getMatchConfig());
  } catch (err) {
    await recordDecision(client, tenant, {
      decisionType: "match_error",
      subjectType: "shift",
      subjectId: offer.shift.id,
      summary: `Re-matching after decline failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return html(`<h1>Response recorded</h1><p>Thanks for letting us know. We're finding another caregiver for this shift.</p>`);
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
