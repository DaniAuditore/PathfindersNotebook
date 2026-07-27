import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface ProvisionableClub {
  id: string;
  name: string;
}

/** Reads only the signed-in actor's RLS-visible administrator clubs for operational provisioning. */
export class SupabaseOfficialProvisioningReader {
  async listAdminClubs(actorId: string): Promise<readonly ProvisionableClub[]> {
    const supabase = await createSupabaseServerClient();
    const { data: memberships, error: membershipError } = await supabase
      .from("memberships")
      .select("club_id")
      .eq("user_id", actorId)
      .eq("role", "admin");
    if (membershipError || !memberships) throw new Error("Unable to load administrator clubs.");

    const clubIds = memberships.map((membership) => membership.club_id);
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
