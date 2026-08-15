import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TenantContext } from "../_shared/types.ts";

/**
 * Turns an approved staff request into open shifts — the loop-closer that
 * connects the facility side to the caregiver side. Once the shifts are open,
 * the normal 15-minute Operations poll matches and offers them to caregivers.
 *
 * Agency-internal: called with the service-role key + x-tenant-slug via
 * createAgentHandler, not exposed to the public intake endpoint.
 */
export interface FulfillInput {
  staffRequestId: string;
  startTime: string; // ISO timestamp for the shift window
  endTime: string;
  requiredCredential?: string; // overrides the request's credential/role
  payRateMin?: number;
  payRateMax?: number;
  payPeriod?: string; // hour | shift | day | week
  isPublic?: boolean; // list on the public board (default true)
}

export interface FulfillResult {
  staffRequestId: string;
  shiftsCreated: number;
  status: "approved";
}

export async function fulfillStaffRequest(
  client: SupabaseClient,
  tenant: TenantContext,
  input: FulfillInput,
): Promise<FulfillResult> {
  if (!input?.staffRequestId) throw new Error("staffRequestId is required.");
  if (!input.startTime || !input.endTime) throw new Error("startTime and endTime are required.");

  const { data: request, error } = await client
    .from("staff_requests")
    .select("*")
    .eq("id", input.staffRequestId)
    .eq("tenant_id", tenant.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!request) throw new Error(`Staff request ${input.staffRequestId} not found.`);

  // shifts.required_credential is NOT NULL — fall back to the request's
  // credential, then the role, if the caller didn't override it.
  const credential = input.requiredCredential ??
    (request.required_credential as string | null) ??
    (request.role as string);
  const headcount = Math.max(1, (request.headcount as number | null) ?? 1);

  // One shift row per opening so each can be matched and filled independently.
  const rows = Array.from({ length: headcount }, () => ({
    tenant_id: tenant.tenantId,
    client_site: request.facility_name as string,
    city: (request.city as string | null) ?? null,
    role_required: request.role as string,
    required_credential: credential,
    employment_type: (request.employment_type as string | null) ?? null,
    start_time: input.startTime,
    end_time: input.endTime,
    pay_rate_min: input.payRateMin ?? null,
    pay_rate_max: input.payRateMax ?? null,
    pay_period: input.payPeriod ?? "hour",
    slots: 1,
    is_public: input.isPublic ?? true,
    status: "open",
  }));

  const { data: created, error: insErr } = await client.from("shifts").insert(rows).select("id");
  if (insErr) throw insErr;

  const { error: updErr } = await client
    .from("staff_requests")
    .update({ status: "approved" })
    .eq("id", input.staffRequestId);
  if (updErr) throw updErr;

  await client.from("agent_decisions").insert({
    tenant_id: tenant.tenantId,
    agent: "operations",
    decision_type: "staff_request_fulfilled",
    subject_type: "staff_request",
    subject_id: input.staffRequestId,
    summary: `Created ${created?.length ?? rows.length} open shift(s) from ${request.facility_name}'s request for ${headcount}× ${request.role}.`,
  });

  return { staffRequestId: input.staffRequestId, shiftsCreated: created?.length ?? rows.length, status: "approved" };
}
