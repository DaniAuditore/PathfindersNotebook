import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type CanonicalRole = "SYSTEM_ADMIN" | "CLUB_DIRECTOR" | "INSTRUCTOR" | "COUNSELOR";

export interface SessionActor {
  id: string;
  email?: string;
}

export async function requireSession(): Promise<SessionActor> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) throw new AuthorizationError("A valid session is required.");

  return { id: data.user.id, email: data.user.email };
}

export async function requireRole(clubId: string, allowedRoles: readonly CanonicalRole[]): Promise<SessionActor> {
  const actor = await requireSession();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", actor.id)
    .in("role", [...allowedRoles])
    .maybeSingle();

  if (error || !data) throw new AuthorizationError();
  return actor;
}

export async function requireClubResourceScope(
  clubId: string,
  allowedRoles: readonly CanonicalRole[],
  resourceBelongsToClub: (clubId: string) => Promise<boolean>,
): Promise<SessionActor> {
  const actor = await requireRole(clubId, allowedRoles);
  if (!(await resourceBelongsToClub(clubId))) throw new AuthorizationError("The requested resource is outside this club.");
  return actor;
}
