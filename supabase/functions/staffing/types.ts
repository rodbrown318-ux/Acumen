// Public "Request Staff" payload — a facility/client asking the agency to fill
// a role. The other side of the marketplace from the caregiver applications.
export interface StaffRequestInput {
  tenant: string; // tenant slug
  facilityName: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  city?: string;
  role: string;
  credential?: string;
  employmentType?: string; // per_diem | travel | contract | permanent
  headcount?: number;
  startDate?: string; // ISO date
  endDate?: string;
  notes?: string;
}

export interface TenantRef {
  tenantId: string;
  tenantSlug: string;
  displayName: string;
}
