import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { Caregiver } from "../operations/types.ts";

export async function updateContact(
  client: SupabaseClient,
  caregiverId: string,
  patch: { phone?: string; email?: string },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.email !== undefined) update.email = patch.email;
  if (Object.keys(update).length === 0) return;
  const { error } = await client.from("caregivers").update(update).eq("id", caregiverId);
  if (error) throw error;
}

export async function addCredential(
  client: SupabaseClient,
  caregiverId: string,
  input: { credentialType: string; expiresAt?: string },
): Promise<string> {
  const { data, error } = await client
    .from("caregiver_credentials")
    .insert({
      caregiver_id: caregiverId,
      credential_type: input.credentialType,
      expires_at: input.expiresAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Replace the caregiver's weekly availability with the supplied windows. */
export async function setAvailability(
  client: SupabaseClient,
  caregiverId: string,
  slots: { weekday: number; startTime: string; endTime: string }[],
): Promise<void> {
  const { error: delErr } = await client
    .from("caregiver_availability")
    .delete()
    .eq("caregiver_id", caregiverId);
  if (delErr) throw delErr;

  if (!slots.length) return;
  const rows = slots.map((s) => ({
    caregiver_id: caregiverId,
    weekday: s.weekday,
    start_time: s.startTime,
    end_time: s.endTime,
  }));
  const { error } = await client.from("caregiver_availability").insert(rows);
  if (error) throw error;
}

export async function saveSearch(
  client: SupabaseClient,
  caregiver: Caregiver,
  input: { label: string; filters: Record<string, unknown>; notify?: boolean },
): Promise<string> {
  const { data, error } = await client
    .from("saved_searches")
    .insert({
      caregiver_id: caregiver.id,
      tenant_id: caregiver.tenant_id,
      label: input.label,
      filters: input.filters ?? {},
      notify: input.notify ?? true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteSearch(
  client: SupabaseClient,
  caregiverId: string,
  searchId: string,
): Promise<void> {
  const { error } = await client
    .from("saved_searches")
    .delete()
    .eq("id", searchId)
    .eq("caregiver_id", caregiverId);
  if (error) throw error;
}

export async function addReferral(
  client: SupabaseClient,
  caregiver: Caregiver,
  input: { name: string; contact?: string; note?: string },
): Promise<string> {
  const { data, error } = await client
    .from("referrals")
    .insert({
      tenant_id: caregiver.tenant_id,
      caregiver_id: caregiver.id,
      referral_name: input.name,
      referral_contact: input.contact ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
