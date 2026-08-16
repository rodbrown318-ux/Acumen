// Shapes returned by the candidate portal. Everything here is derived from the
// caregiver's own rows (caregivers, caregiver_credentials, caregiver_availability,
// shifts, saved_searches) -- the portal stores almost nothing new, it just
// summarizes what the Operations agent already tracks.

/** One row of the "complete your profile" checklist. */
export interface ProfileSection {
  label: string;
  done: boolean;
}

/** An actionable item in "get ready for your next assignment". */
export interface PortalTask {
  key: string;
  title: string;
  status: "done" | "todo";
  detail?: string;
}

export interface UpcomingAssignment {
  id: string;
  facility: string; // shifts.client_site
  city: string | null;
  role: string; // shifts.role_required
  startTime: string;
  endTime: string;
}

export interface SavedSearch {
  id: string;
  label: string;
  notify: boolean;
}

export interface ApplicationStatus {
  id: string;
  role: string | null;
  status: string; // new | contacted | screening | placed | rejected | withdrawn
  appliedAt: string;
}

export interface PortalSummary {
  firstName: string;
  fullName: string;
  profile: {
    complete: number;
    total: number;
    sections: ProfileSection[];
  };
  tasks: PortalTask[];
  upcomingAssignments: UpcomingAssignment[];
  savedSearches: SavedSearch[];
  applications: ApplicationStatus[];
}
