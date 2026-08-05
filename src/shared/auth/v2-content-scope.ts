import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type MemberRow = { id: string };
type DirectorRow = { club_id: string };
type StaffRow = { unit_id: string; role: "INSTRUCTOR" | "COUNSELOR" };

export interface V2ContentScope {
  memberIds: readonly string[];
  directorClubIds: readonly string[];
  staffUnitIds: readonly string[];
  canReview: boolean;
}

/**
 * Reads the signed-in actor's v2 assignments only. Content readers still rely
 * on database RLS for the final card/evidence scope; this projection is solely
 * for UI capability hints and must never consult legacy role assignments.
 */
export async function readV2ContentScope(supabase: SupabaseClient, actorId: string): Promise<V2ContentScope> {
  const { data: members, error: memberError } = await supabase
    .from("club_members")
    .select("id")
    .eq("user_id", actorId)
    .eq("lifecycle", "ACTIVE");
  if (memberError) throw new Error("Unable to load v2 member scope.");

  const memberIds = (members ?? []).map((member) => (member as MemberRow).id);
  if (memberIds.length === 0) return { memberIds: [], directorClubIds: [], staffUnitIds: [], canReview: false };

  const [{ data: directors, error: directorError }, { data: staff, error: staffError }] = await Promise.all([
    supabase.from("club_director_assignments").select("club_id").in("member_id", memberIds).is("active_until", null),
    supabase.from("staff_unit_assignments").select("unit_id, role").in("member_id", memberIds).is("ended_at", null),
  ]);
  if (directorError || staffError) throw new Error("Unable to load v2 staff scope.");

  const directorClubIds = (directors ?? []).map((director) => (director as DirectorRow).club_id);
  const staffUnitIds = (staff ?? []).map((assignment) => (assignment as StaffRow).unit_id);
  return { memberIds, directorClubIds, staffUnitIds, canReview: directorClubIds.length > 0 || staffUnitIds.length > 0 };
}
