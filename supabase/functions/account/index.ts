import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { getAuthUserId } from "../_shared/userAuth.ts";
import { log } from "../_shared/logger.ts";
import { getCaregiverByAuthUserId, getCaregiverByToken } from "../portal/db.ts";
import {
  addCredential,
  addReferral,
  deleteSearch,
  saveSearch,
  setAvailability,
  updateContact,
} from "./db.ts";

/**
 * Candidate self-service: the write side of the portal, so its "get ready"
 * tasks actually do something. Authenticated by the caregiver's opaque
 * portal_token (magic-link), like the read-only portal endpoint.
 *
 *   POST /functions/v1/account
 *   { "token":"<caregiver.portal_token>", "action":"<name>", "payload":{...} }
 *
 * Actions: updateContact, addCredential, setAvailability, saveSearch,
 * deleteSearch, recommendRecruiter.
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json({ ok: false, error: "This endpoint only supports POST." }, 405);
  }

  let body: { token?: string; action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const { token, action } = body;
  const payload = body.payload ?? {};
  if (!action) return json({ ok: false, error: "Missing 'action'." }, 400);

  try {
    const client = getServiceClient();
    // Real login (Authorization: Bearer <jwt>) first, then legacy portal_token.
    let caregiver: Awaited<ReturnType<typeof getCaregiverByToken>> = null;
    const userId = await getAuthUserId(req, client);
    if (userId) caregiver = await getCaregiverByAuthUserId(client, userId);
    if (!caregiver && token) caregiver = await getCaregiverByToken(client, token);
    if (!caregiver) return json({ ok: false, error: "Not signed in, or invalid portal link." }, 401);

    let result: unknown;
    switch (action) {
      case "updateContact":
        await updateContact(client, caregiver.id, {
          phone: str(payload.phone),
          email: str(payload.email),
        });
        result = { updated: true };
        break;
      case "addCredential": {
        const credentialType = str(payload.credentialType);
        if (!credentialType) return json({ ok: false, error: "credentialType is required." }, 400);
        result = { id: await addCredential(client, caregiver.id, { credentialType, expiresAt: str(payload.expiresAt) }) };
        break;
      }
      case "setAvailability": {
        const slots = Array.isArray(payload.slots) ? payload.slots as { weekday: number; startTime: string; endTime: string }[] : [];
        await setAvailability(client, caregiver.id, slots);
        result = { count: slots.length };
        break;
      }
      case "saveSearch": {
        const label = str(payload.label);
        if (!label) return json({ ok: false, error: "label is required." }, 400);
        const filters = (payload.filters && typeof payload.filters === "object") ? payload.filters as Record<string, unknown> : {};
        result = { id: await saveSearch(client, caregiver, { label, filters, notify: payload.notify !== false }) };
        break;
      }
      case "deleteSearch": {
        const id = str(payload.id);
        if (!id) return json({ ok: false, error: "id is required." }, 400);
        await deleteSearch(client, caregiver.id, id);
        result = { deleted: true };
        break;
      }
      case "recommendRecruiter": {
        const name = str(payload.name);
        if (!name) return json({ ok: false, error: "name is required." }, 400);
        result = { id: await addReferral(client, caregiver, { name, contact: str(payload.contact), note: str(payload.note) }) };
        break;
      }
      default:
        return json({ ok: false, error: `Unknown action '${action}'.` }, 400);
    }

    log("operations", "account_action", { caregiverId: caregiver.id, action });
    return json({ ok: true, action, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("operations", "account_error", { action, error: message });
    return json({ ok: false, error: message }, 500);
  }
});

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
