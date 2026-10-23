import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { log } from "../_shared/logger.ts";
import {
  getShiftBrief,
  insertApplication,
  recordDecision,
  resolveTenantBySlug,
} from "./db.ts";
import { sendRecruiterSms } from "./sms.ts";
import { ApplicationInput } from "./types.ts";

/**
 * Public quick-apply intake for the job board (Tier 1 of docs/site-roadmap.md).
 *
 * Flow, ordered so a lead is never lost:
 *   1. Validate + resolve tenant from the posted slug.
 *   2. Insert the application row (the durable lead) FIRST.
 *   3. Fire a best-effort recruiter SMS; a failure here is logged and recorded
 *      but never fails the request -- the lead is already saved.
 *   4. Return ok with the new application id.
 *
 * Public and unauthenticated like operations' /respond and the jobs board: the
 * caller is an anonymous job seeker, so tenant identity comes from the payload,
 * not an x-tenant-slug header. Spam protection (e.g. Cloudflare Turnstile) is a
 * Tier 3 item and belongs in front of this endpoint.
 *
 *   POST /functions/v1/applications
 *   { "tenant": "complete-staffing", "firstName": "Dana", "phone": "+1...",
 *     "shiftId": "<uuid?>", "role": "CNA", "email": "<optional>" }
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json({ ok: false, error: "This endpoint only supports POST." }, 405);
  }

  let input: ApplicationInput;
  try {
    input = await req.json() as ApplicationInput;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const validationError = validate(input);
  if (validationError) {
    return json({ ok: false, error: validationError }, 400);
  }

  try {
    const client = getServiceClient();
    const tenant = await resolveTenantBySlug(client, input.tenant.trim());
    if (!tenant) {
      return json({ ok: false, error: `Unknown tenant: ${input.tenant}` }, 404);
    }

    // Only keep shift_id if it's a real shift belonging to this tenant.
    let shiftId: string | null = null;
    let shiftLabel = "a general application";
    if (input.shiftId) {
      const brief = await getShiftBrief(client, tenant, input.shiftId);
      if (brief) {
        shiftId = brief.id;
        shiftLabel = `${brief.role_required} at ${brief.client_site}${brief.city ? `, ${brief.city}` : ""}`;
      }
    }

    const application = await insertApplication(client, tenant, input, shiftId);

    const smsBody =
      `New applicant: ${input.firstName} (${input.phone})` +
      `${input.role ? ` — ${input.role}` : ""} for ${shiftLabel}. ` +
      `Reply/ call to follow up. [${tenant.displayName}]`;
    const sms = await sendRecruiterSms(smsBody);

    await recordDecision(client, tenant, {
      decisionType: "application_received",
      subjectType: "application",
      subjectId: application.id,
      summary: `${input.firstName} applied for ${shiftLabel}. Recruiter SMS ${sms.sent ? "sent" : "not sent"}.`,
      reasoning: sms.sent ? undefined : { smsSkipped: sms.reason },
    });

    log("operations", "application_received", {
      tenant: tenant.tenantSlug,
      applicationId: application.id,
      hasShift: shiftId !== null,
      smsSent: sms.sent,
    });
    if (!sms.sent) {
      log("operations", "application_sms_skipped", { tenant: tenant.tenantSlug, reason: sms.reason });
    }

    return json({ ok: true, applicationId: application.id, recruiterNotified: sms.sent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "application_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function validate(input: ApplicationInput): string | null {
  if (!input || typeof input !== "object") return "Missing request body.";
  if (!input.tenant?.trim()) return "Missing 'tenant'.";
  if (!input.firstName?.trim()) return "Please enter your first name.";
  if (input.firstName.trim().length > 80) return "First name is too long.";
  const digits = (input.phone ?? "").replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return "Please enter a valid mobile number.";
  if (input.email && input.email.length > 200) return "Email is too long.";
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
