import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { Caregiver, CaregiverAvailability, CaregiverCredential } from "../operations/types.ts";
import {
  PortalSummary,
  PortalTask,
  ProfileSection,
  SavedSearch,
  UpcomingAssignment,
} from "./types.ts";

// A credential within this many days of expiry counts as "expiring" and
// surfaces a renewal task -- the compliance nudge Aya's portal makes central.
const EXPIRING_SOON_DAYS = 30;

/** Resolve a caregiver from their opaque portal token (null if unknown). */
export async function getCaregiverByToken(
  client: SupabaseClient,
  token: string,
): Promise<Caregiver | null> {
  const { data, error } = await client
    .from("caregivers")
    .select("*")
    .eq("portal_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as Caregiver | null) ?? null;
}

/**
 * Build the whole portal home from the caregiver's own rows. One function so
 * the endpoint stays a thin wrapper; all the derivation lives here.
 */
export async function buildPortalSummary(
  client: SupabaseClient,
  caregiver: Caregiver,
): Promise<PortalSummary> {
  const [credentials, availability, assignments, saved] = await Promise.all([
    fetchCredentials(client, caregiver.id),
    fetchAvailability(client, caregiver.id),
    fetchUpcomingAssignments(client, caregiver.id),
    fetchSavedSearches(client, caregiver.id),
  ]);

  const now = Date.now();
  const expiringSoon = credentials.filter((c) =>
    c.expires_at && new Date(c.expires_at).getTime() <= now + EXPIRING_SOON_DAYS * 864e5
  );
  const hasExpired = credentials.some((c) => c.expires_at && new Date(c.expires_at).getTime() <= now);

  const sections: ProfileSection[] = [
    { label: "Contact details", done: Boolean(caregiver.phone && caregiver.email) },
    { label: "Credentials on file", done: credentials.length > 0 },
    { label: "Weekly availability", done: availability.length > 0 },
    { label: "Compliance up to date", done: credentials.length > 0 && !hasExpired },
    { label: "Active for placement", done: caregiver.is_active },
  ];
  const complete = sections.filter((s) => s.done).length;

  const tasks: PortalTask[] = [
    {
      key: "verify_contact",
      title: "Verify your contact information",
      status: caregiver.phone && caregiver.email ? "done" : "todo",
      detail: caregiver.phone && caregiver.email
        ? undefined
        : "Add a mobile number and email so recruiters can reach you fast.",
    },
    {
      key: "add_credentials",
      title: "Add your credentials",
      status: credentials.length > 0 ? "done" : "todo",
      detail: credentials.length > 0 ? undefined : "Upload at least one active credential (CNA, HHA, RN…).",
    },
    {
      key: "set_availability",
      title: "Set your weekly availability",
      status: availability.length > 0 ? "done" : "todo",
      detail: availability.length > 0 ? undefined : "Tell us which days and hours you can work.",
    },
    {
      key: "renew_credentials",
      title: "Renew expiring credentials",
      status: expiringSoon.length === 0 ? "done" : "todo",
      detail: expiringSoon.length === 0
        ? undefined
        : `Expiring within ${EXPIRING_SOON_DAYS} days: ${expiringSoon.map((c) => c.credential_type).join(", ")}.`,
    },
  ];

  return {
    firstName: caregiver.full_name.split(" ")[0],
    fullName: caregiver.full_name,
    profile: { complete, total: sections.length, sections },
    tasks,
    upcomingAssignments: assignments,
    savedSearches: saved,
  };
}

async function fetchCredentials(client: SupabaseClient, caregiverId: string): Promise<CaregiverCredential[]> {
  const { data, error } = await client
    .from("caregiver_credentials")
    .select("*")
    .eq("caregiver_id", caregiverId);
  if (error) throw error;
  return (data as CaregiverCredential[]) ?? [];
}

async function fetchAvailability(client: SupabaseClient, caregiverId: string): Promise<CaregiverAvailability[]> {
  const { data, error } = await client
    .from("caregiver_availability")
    .select("*")
    .eq("caregiver_id", caregiverId);
  if (error) throw error;
  return (data as CaregiverAvailability[]) ?? [];
}

async function fetchUpcomingAssignments(
  client: SupabaseClient,
  caregiverId: string,
): Promise<UpcomingAssignment[]> {
  const { data, error } = await client
    .from("shifts")
    .select("id, client_site, city, role_required, start_time, end_time")
    .eq("assigned_caregiver_id", caregiverId)
    .eq("status", "filled")
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id as string,
    facility: s.client_site as string,
    city: (s.city as string | null) ?? null,
    role: s.role_required as string,
    startTime: s.start_time as string,
    endTime: s.end_time as string,
  }));
}

async function fetchSavedSearches(client: SupabaseClient, caregiverId: string): Promise<SavedSearch[]> {
  const { data, error } = await client
    .from("saved_searches")
    .select("id, label, notify")
    .eq("caregiver_id", caregiverId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id as string, label: s.label as string, notify: s.notify as boolean }));
}
