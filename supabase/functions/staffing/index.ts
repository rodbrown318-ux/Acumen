import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { log } from "../_shared/logger.ts";
import { findOrCreateClient, insertStaffRequest, recordDecision, resolveTenantBySlug } from "./db.ts";
import { notifyAgency } from "./notify.ts";
import { StaffRequestInput } from "./types.ts";

/**
 * Public "Request Staff" intake — the facility/client side of the marketplace.
 * A hospital, ALF, SNF, home-health agency, or private family submits a request
 * to fill a role; it's saved (and the client record found/created) and the
 * agency is emailed. Reviewed requests become open shifts via internal tooling.
 *
 * Ordered so a lead is never lost: save first, then best-effort notify.
 * Public + unauthenticated like the caregiver endpoints; tenant from the posted
 * slug, so it's automatically multi-tenant (white-label ready).
 *
 *   POST /functions/v1/staffing
 *   { "tenant":"complete-staffing", "facilityName":"Orlando Health",
 *     "requesterName":"Pat Lee", "requesterEmail":"pat@orlandohealth.com",
 *     "role":"CNA", "headcount":2, "city":"Orlando", "employmentType":"per_diem",
 *     "startDate":"2026-09-01", "notes":"Med-surg, days" }
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json({ ok: false, error: "This endpoint only supports POST." }, 405);
  }

  let input: StaffRequestInput;
  try {
    input = await req.json() as StaffRequestInput;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const validationError = validate(input);
  if (validationError) return json({ ok: false, error: validationError }, 400);

  try {
    const client = getServiceClient();
    const tenant = await resolveTenantBySlug(client, input.tenant.trim());
    if (!tenant) return json({ ok: false, error: `Unknown tenant: ${input.tenant}` }, 404);

    const clientId = await findOrCreateClient(client, tenant, input);
    const requestId = await insertStaffRequest(client, tenant, clientId, input);

    const notice = await notifyAgency(input, tenant.displayName);
    await recordDecision(client, tenant, {
      subjectId: requestId,
      summary: `${input.facilityName} requested ${input.headcount ?? 1}× ${input.role}. Agency email ${notice.sent ? "sent" : "not sent"}.`,
    });

    log("operations", "staff_request_received", {
      tenant: tenant.tenantSlug,
      requestId,
      clientId,
      role: input.role,
      headcount: input.headcount ?? 1,
      notified: notice.sent,
    });
    if (!notice.sent) log("operations", "staff_request_notify_skipped", { reason: notice.reason });

    return json({ ok: true, requestId, clientId, agencyNotified: notice.sent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "staffing_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function validate(input: StaffRequestInput): string | null {
  if (!input || typeof input !== "object") return "Missing request body.";
  if (!input.tenant?.trim()) return "Missing 'tenant'.";
  if (!input.facilityName?.trim()) return "Please enter the facility name.";
  if (!input.requesterName?.trim()) return "Please enter a contact name.";
  const email = (input.requesterEmail ?? "").trim();
  if (!email || !email.includes("@") || email.length > 200) return "Please enter a valid contact email.";
  if (!input.role?.trim()) return "Please choose a role.";
  if (input.headcount != null && (input.headcount < 1 || input.headcount > 500)) {
    return "Headcount is out of range.";
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
