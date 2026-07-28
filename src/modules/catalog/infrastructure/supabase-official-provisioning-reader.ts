import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface ProvisionableClub {
  id: string;
  name: string;
}

/** Reads only the signed-in actor's RLS-visible canonical director clubs for operational provisioning. */
export class SupabaseOfficialProvisioningReader {
  async listAdminClubs(actorId: string): Promise<readonly ProvisionableClub[]> {
    const supabase = await createSupabaseServerClient();
    const { data: assignments, error: assignmentError } = await supabase
      .from("role_assignments")
      .select("club_id")
      .eq("user_id", actorId)
      .eq("role", "CLUB_DIRECTOR")
      .is("revoked_at", null);
    if (assignmentError || !assignments) throw new Error("Unable to load administrator clubs.");

    const clubIds = assignments.map((assignment) => assignment.club_id);
    if (clubIds.length === 0) return [];

    const { data: clubs, error: clubError } = await supabase
      .from("clubs")
      .select("id, name")
      .in("id", clubIds)
      .order("name");
    if (clubError || !clubs) throw new Error("Unable to load administrator clubs.");

    return clubs;
  }
}
