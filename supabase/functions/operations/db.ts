import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TenantContext } from "../_shared/types.ts";
import {
  CandidateCaregiver,
  Caregiver,
  CaregiverAvailability,
  CaregiverCredential,
  Shift,
  ShiftOffer,
} from "./types.ts";

export async function getUnfilledShifts(
  client: SupabaseClient,
  tenant: TenantContext,
): Promise<Shift[]> {
  const { data, error } = await client
    .from("shifts")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .in("status", ["open", "offered"])
    .order("start_time", { ascending: true });

  if (error) throw error;
  return data as Shift[];
}

/**
 * Deterministic pre-filter: active caregivers with a non-expired matching
 * credential, weekly availability covering the shift window, and no
 * conflicting assignment or pending offer. This narrows the field before
 * the agent's judgment call picks the best one.
 */
export async function getCandidateCaregivers(
  client: SupabaseClient,
  tenant: TenantContext,
  shift: Shift,
): Promise<CandidateCaregiver[]> {
  const { data: caregivers, error: caregiverErr } = await client
    .from("caregivers")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .eq("is_active", true);
  if (caregiverErr) throw caregiverErr;

  const { data: credentials, error: credErr } = await client
    .from("caregiver_credentials")
    .select("*")
    .eq("credential_type", shift.required_credential);
  if (credErr) throw credErr;

  const { data: availability, error: availErr } = await client
    .from("caregiver_availability")
    .select("*");
  if (availErr) throw availErr;

  const { data: conflictingShifts, error: shiftErr } = await client
    .from("shifts")
    .select("id, assigned_caregiver_id, start_time, end_time")
    .eq("tenant_id", tenant.tenantId)
    .not("assigned_caregiver_id", "is", null)
    .neq("id", shift.id);
  if (shiftErr) throw shiftErr;

  const { data: pendingOffers, error: offerErr } = await client
    .from("shift_offers")
    .select("caregiver_id, shift_id, status")
    .eq("status", "pending")
    .neq("shift_id", shift.id);
  if (offerErr) throw offerErr;

  // Caregivers already offered *this* shift (declined or expired) are
  // excluded so a decline can't loop the agent right back to the same
  // person on the next match attempt.
  const { data: priorOffersForShift, error: priorOfferErr } = await client
    .from("shift_offers")
    .select("caregiver_id")
    .eq("shift_id", shift.id);
  if (priorOfferErr) throw priorOfferErr;

  const shiftStart = new Date(shift.start_time);
  const shiftEnd = new Date(shift.end_time);
  const weekday = shiftStart.getUTCDay();

  const conflictingShiftIds = new Set(
    (conflictingShifts ?? [])
      .filter((s) => overlaps(shiftStart, shiftEnd, new Date(s.start_time), new Date(s.end_time)))
      .map((s) => s.assigned_caregiver_id as string),
  );

  // Any caregiver with another pending offer is treated as unavailable
  // until that offer resolves, to avoid double-booking on accept.
  const busyFromPendingOffers = new Set(
    (pendingOffers ?? []).map((o) => o.caregiver_id as string),
  );
  const alreadyOfferedThisShift = new Set(
    (priorOffersForShift ?? []).map((o) => o.caregiver_id as string),
  );

  const candidates: CandidateCaregiver[] = [];
  for (const caregiver of (caregivers as Caregiver[]) ?? []) {
    if (conflictingShiftIds.has(caregiver.id)) continue;
    if (busyFromPendingOffers.has(caregiver.id)) continue;
    if (alreadyOfferedThisShift.has(caregiver.id)) continue;

    const matchingCredential = ((credentials as CaregiverCredential[]) ?? []).find(
      (c) =>
        c.caregiver_id === caregiver.id &&
        (!c.expires_at || new Date(c.expires_at) > shiftEnd),
    );
    if (!matchingCredential) continue;

    // NOTE: compares against UTC clock time. caregiver_availability.start_time/
    // end_time need to be entered in UTC for this to be correct -- if shifts
    // span multiple business timezones, store a tenant/site timezone and
    // convert before comparing rather than assuming UTC.
    const isAvailable = ((availability as CaregiverAvailability[]) ?? []).some((a) =>
      a.caregiver_id === caregiver.id &&
      a.weekday === weekday &&
      timeStringToMinutes(a.start_time) <= dateToMinutes(shiftStart) &&
      timeStringToMinutes(a.end_time) >= dateToMinutes(shiftEnd)
    );
    if (!isAvailable) continue;

    candidates.push({ ...caregiver, matchingCredential });
  }

  return candidates;
}

export async function createOffer(
  client: SupabaseClient,
  shift: Shift,
  caregiverId: string,
  expiresAt: Date,
): Promise<ShiftOffer> {
  const { data, error } = await client
    .from("shift_offers")
    .insert({ shift_id: shift.id, caregiver_id: caregiverId, expires_at: expiresAt.toISOString() })
    .select()
    .single();
  if (error) throw error;

  await client.from("shifts").update({ status: "offered" }).eq("id", shift.id);

  return data as ShiftOffer;
}

export async function getExpiredPendingOffers(
  client: SupabaseClient,
  tenant: TenantContext,
): Promise<(ShiftOffer & { shift: Shift })[]> {
  const { data, error } = await client
    .from("shift_offers")
    .select("*, shift:shifts!inner(*)")
    .eq("status", "pending")
    .eq("shift.tenant_id", tenant.tenantId)
    .lt("expires_at", new Date().toISOString());
  if (error) throw error;
  return data as unknown as (ShiftOffer & { shift: Shift })[];
}

export async function expireOffer(client: SupabaseClient, offerId: string): Promise<void> {
  const { error } = await client
    .from("shift_offers")
    .update({ status: "expired", responded_at: new Date().toISOString() })
    .eq("id", offerId);
  if (error) throw error;
}

export async function getOfferByToken(
  client: SupabaseClient,
  token: string,
): Promise<(ShiftOffer & { shift: Shift; caregiver: Caregiver }) | null> {
  const { data, error } = await client
    .from("shift_offers")
    .select("*, shift:shifts(*), caregiver:caregivers(*)")
    .eq("response_token", token)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as (ShiftOffer & { shift: Shift; caregiver: Caregiver }) | null;
}

export async function respondToOffer(
  client: SupabaseClient,
  offerId: string,
  status: "accepted" | "declined",
): Promise<void> {
  const { error } = await client
    .from("shift_offers")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", offerId);
  if (error) throw error;
}

export async function fillShift(
  client: SupabaseClient,
  shiftId: string,
  caregiverId: string,
): Promise<void> {
  const { error } = await client
    .from("shifts")
    .update({ status: "filled", assigned_caregiver_id: caregiverId })
    .eq("id", shiftId);
  if (error) throw error;
}

export async function reopenShift(client: SupabaseClient, shiftId: string): Promise<void> {
  const { error } = await client
    .from("shifts")
    .update({ status: "open" })
    .eq("id", shiftId);
  if (error) throw error;
}

export async function getShiftsNeedingEscalation(
  client: SupabaseClient,
  tenant: TenantContext,
  hoursBeforeStart: number,
): Promise<Shift[]> {
  const threshold = new Date(Date.now() + hoursBeforeStart * 60 * 60 * 1000);
  const { data, error } = await client
    .from("shifts")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .in("status", ["open", "offered"])
    .is("escalated_at", null)
    .lt("start_time", threshold.toISOString());
  if (error) throw error;
  return data as Shift[];
}

// Escalating only records that an alert was sent -- it deliberately leaves
// `status` as open/offered so the agent keeps trying to fill the shift
// right up to (and after) start time instead of giving up on it.
export async function markShiftEscalated(client: SupabaseClient, shiftId: string): Promise<void> {
  const { error } = await client
    .from("shifts")
    .update({ escalated_at: new Date().toISOString() })
    .eq("id", shiftId);
  if (error) throw error;
}

export async function recordDecision(
  client: SupabaseClient,
  tenant: TenantContext,
  params: {
    decisionType: string;
    subjectType: string;
    subjectId: string;
    summary: string;
    reasoning?: unknown;
  },
): Promise<void> {
  const { error } = await client.from("agent_decisions").insert({
    tenant_id: tenant.tenantId,
    agent: "operations",
    decision_type: params.decisionType,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    summary: params.summary,
    reasoning: params.reasoning ?? null,
  });
  if (error) throw error;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function dateToMinutes(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
