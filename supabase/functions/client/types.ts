// The signed-in client (facility) resolved from their auth account.
export interface ClientContext {
  id: string;
  tenantId: string;
  name: string;
  city: string | null;
  // How we authenticated: a linked client row, or an agency admin previewing.
  via: "client" | "admin";
}

// A verified caregiver as shown to a client. Deliberately no contact details
// (email/phone) — clients reach caregivers through the agency, so browsing the
// directory never leaks PII.
export interface DirectoryCaregiver {
  id: string;
  name: string;
  profession: string | null;
  specialty: string | null;
  experienceYears: number | null;
  verified: true;
  // The credential types that are currently verified and non-expired.
  verifiedCredentials: string[];
}

// One of the client's own staff requests.
export interface ClientRequest {
  id: string;
  facility: string;
  role: string;
  headcount: number;
  city: string | null;
  status: string;
  createdAt: string;
}
