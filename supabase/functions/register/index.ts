import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { log } from "../_shared/logger.ts";
import { registerCaregiver, resolveTenantBySlug } from "./db.ts";
import { RegisterInput } from "./types.ts";

/**
 * Public registration wizard backend (Aya-style "create your profile in
 * minutes"). Creates a caregiver profile plus optional credentials and weekly
 * availability, and returns a portal magic-link token so the candidate lands
 * straight in their portal.
 *
 * Public + unauthenticated like the other candidate-facing endpoints: tenant
 * identity comes from the posted slug. Add spam protection (Turnstile) in front
 * of this before launch.
 *
 *   POST /functions/v1/register
 *   { "tenant":"complete-staffing", "fullName":"Dana Whitfield",
 *     "email":"dana@example.com", "phone":"+1...", "profession":"CNA",
 *     "specialty":"Acute Care Float", "experienceYears":5,
 *     "credentials":[{"type":"CNA","expiresAt":"2027-01-01"}],
 *     "availability":[{"weekday":1,"startTime":"07:00","endTime":"19:00"}] }
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json({ ok: false, error: "This endpoint only supports POST." }, 405);
  }

  let input: RegisterInput;
  try {
    input = await req.json() as RegisterInput;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const validationError = validate(input);
  if (validationError) return json({ ok: false, error: validationError }, 400);

  try {
    const client = getServiceClient();
    const tenant = await resolveTenantBySlug(client, input.tenant.trim());
    if (!tenant) return json({ ok: false, error: `Unknown tenant: ${input.tenant}` }, 404);

    const { caregiverId, portalToken } = await registerCaregiver(client, tenant, input);

    log("operations", "caregiver_registered", {
      tenant: tenant.tenantSlug,
      caregiverId,
      credentials: input.credentials?.length ?? 0,
      availability: input.availability?.length ?? 0,
    });

    return json({
      ok: true,
      caregiverId,
      portalToken,
      portalPath: `/functions/v1/portal?token=${portalToken}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "register_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function validate(input: RegisterInput): string | null {
  if (!input || typeof input !== "object") return "Missing request body.";
  if (!input.tenant?.trim()) return "Missing 'tenant'.";
  if (!input.fullName?.trim()) return "Please enter your full name.";
  if (input.fullName.trim().length > 120) return "Name is too long.";
  const email = (input.email ?? "").trim();
  if (!email || !email.includes("@") || email.length > 200) return "Please enter a valid email.";
  if (input.experienceYears != null && (input.experienceYears < 0 || input.experienceYears > 80)) {
    return "Experience years is out of range.";
  }
  if (input.credentials && !Array.isArray(input.credentials)) return "credentials must be a list.";
  if (input.availability && !Array.isArray(input.availability)) return "availability must be a list.";
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
