export interface Shift {
  id: string;
  tenant_id: string;
  client_site: string;
  role_required: string;
  required_credential: string;
  start_time: string;
  end_time: string;
  status: "open" | "offered" | "filled" | "unfilled_escalated";
  assigned_caregiver_id: string | null;
  escalated_at: string | null;
}

export interface Caregiver {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
}

export interface CaregiverCredential {
  id: string;
  caregiver_id: string;
  credential_type: string;
  expires_at: string | null;
}

export interface CaregiverAvailability {
  id: string;
  caregiver_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface ShiftOffer {
  id: string;
  shift_id: string;
  caregiver_id: string;
  status: "pending" | "accepted" | "declined" | "expired";
  response_token: string;
  sent_at: string;
  responded_at: string | null;
  expires_at: string;
}

/** A caregiver who has passed the deterministic credential/availability/conflict filter. */
export interface CandidateCaregiver extends Caregiver {
  matchingCredential: CaregiverCredential;
}
