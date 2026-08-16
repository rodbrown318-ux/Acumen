import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { resolveTenant } from "../_shared/auth.ts";
import { log } from "../_shared/logger.ts";
import {
  getAlreadyAlerted,
  getMatchingOpenShifts,
  getNotifiableSearches,
  recordAlertsSent,
  recordDecision,
} from "./db.ts";
import { sendJobAlertEmail } from "./email.ts";

/**
 * Job-alerts poll (Aya-style saved-search notifications). Cron POSTs
 * {"action":"pollAlerts"} with an x-tenant-slug header every 30 minutes (see
 * 20260813030001_job_alerts_cron.sql). For each saved search with alerts on,
 * it emails the caregiver any open matching shift it hasn't alerted them about
 * yet, then records it in job_alerts_sent so it never double-sends.
 *
 * Service-to-service like the Operations poll: tenant comes from the header and
 * the service-role key gates the call.
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json({ ok: false, error: "This endpoint only supports POST." }, 405);
  }

  try {
    const client = getServiceClient();
    const tenant = await resolveTenant(req, client);
    const { action } = await req.json() as { action?: string };
    if (action !== "pollAlerts") {
      return json({ ok: false, error: `Unknown action '${action ?? ""}'.` }, 400);
    }

    const searches = await getNotifiableSearches(client, tenant);
    let notified = 0;
    let shiftsSent = 0;

    for (const search of searches) {
      const matches = await getMatchingOpenShifts(client, tenant, search.filters);
      if (!matches.length) continue;

      const alreadySent = await getAlreadyAlerted(client, search.id);
      const fresh = matches.filter((m) => !alreadySent.has(m.id));
      if (!fresh.length) continue;

      try {
        await sendJobAlertEmail(search.caregiverEmail, search.caregiverName, search.label, fresh);
        await recordAlertsSent(client, search.id, fresh.map((m) => m.id));
        await recordDecision(client, tenant, {
          subjectId: search.id,
          summary: `Alerted ${search.caregiverName} to ${fresh.length} shift(s) matching “${search.label}”.`,
        });
        notified += 1;
        shiftsSent += fresh.length;
      } catch (err) {
        // One caregiver's email failing must not stop the rest of the poll.
        log("operations", "job_alert_send_error", {
          savedSearchId: search.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log("operations", "job_alerts_polled", {
      tenant: tenant.tenantSlug,
      searches: searches.length,
      notified,
      shiftsSent,
    });
    return json({ ok: true, searches: searches.length, notified, shiftsSent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "job_alerts_error", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
