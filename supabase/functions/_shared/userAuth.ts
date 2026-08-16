import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Verify a Supabase Auth JWT from the request's Authorization header and return
 * the authenticated user's id + email (or null if absent/invalid). This is how
 * the candidate-facing endpoints move off opaque magic-link tokens onto real
 * logins: the frontend sends `Authorization: Bearer <access_token>` and we
 * validate it here. The email enables link-by-email for caregivers that predate
 * their auth account.
 *
 * `auth.getUser(jwt)` validates the token against the project's JWT secret
 * regardless of which key the client was created with, so the service-role
 * client is fine to pass in.
 */
export async function getAuthUser(
  req: Request,
  client: SupabaseClient,
): Promise<AuthUser | null> {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
