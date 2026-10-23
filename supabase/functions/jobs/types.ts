// Public, candidate-facing shape of an open shift. This is deliberately a
// strict subset of the internal `shifts` row -- no tenant_id, no
// assigned_caregiver_id, no internal status/escalation fields ever cross this
// boundary. If a column isn't on this type, the public endpoint doesn't select
// it.
export interface PublicJob {
  id: string;
  facility: string; // shifts.client_site, relabeled for candidates
  city: string | null;
  role: string; // shifts.role_required
  credential: string; // shifts.required_credential
  employmentType: string | null; // shifts.employment_type
  startTime: string;
  endTime: string;
  payRateMin: number | null;
  payRateMax: number | null;
  payPeriod: string | null;
  openings: number; // shifts.slots
  summary: string | null; // shifts.public_summary
}

/** Optional case-insensitive filters a candidate can pass as query params. */
export interface JobFilters {
  role?: string;
  city?: string;
  credential?: string;
  employmentType?: string;
}

/** Minimal tenant identity resolved from a public `?tenant=` slug. */
export interface PublicTenant {
  id: string;
  slug: string;
  displayName: string;
}
