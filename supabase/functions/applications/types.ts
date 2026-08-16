// Public quick-apply payload posted from the job board, and the stored row.
// Intentionally tiny: the whole point of quick-apply is the lowest-friction
// first rung (name + phone), with the full profile collected later by a
// recruiter. Everything except firstName + phone is optional.
export interface ApplicationInput {
  tenant: string; // tenant slug, e.g. "complete-staffing"
  firstName: string;
  phone: string;
  email?: string;
  shiftId?: string; // set when applying to a specific listing
  role?: string; // role/credential selected on the board
  source?: string; // defaults to "job_board"
}

export interface Application {
  id: string;
  tenant_id: string;
  shift_id: string | null;
  first_name: string;
  phone: string;
  email: string | null;
  role: string | null;
  source: string;
  status: string;
  created_at: string;
}
