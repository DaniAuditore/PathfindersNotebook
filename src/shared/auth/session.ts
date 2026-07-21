import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type ClubRole = "admin" | "instructor" | "guardian" | "student" | "viewer";

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

export async function requireRole(clubId: string, allowedRoles: readonly ClubRole[]): Promise<SessionActor> {
  const actor = await requireSession();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
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
  allowedRoles: readonly ClubRole[],
  resourceBelongsToClub: (clubId: string) => Promise<boolean>,
): Promise<SessionActor> {
  const actor = await requireRole(clubId, allowedRoles);
  if (!(await resourceBelongsToClub(clubId))) throw new AuthorizationError("The requested resource is outside this club.");
  return actor;
}
