// Public registration payload — the "create your profile in minutes" wizard
// (profession / specialty / experience + optional credentials & availability).
export interface RegisterInput {
  tenant: string; // tenant slug
  fullName: string;
  email: string;
  phone?: string;
  profession?: string; // e.g. "CNA / Nurse Assistant"
  specialty?: string; // e.g. "Acute Care Float"
  experienceYears?: number;
  credentials?: { type: string; expiresAt?: string }[];
  availability?: { weekday: number; startTime: string; endTime: string }[];
}

export interface TenantRef {
  tenantId: string;
  tenantSlug: string;
  displayName: string;
}
