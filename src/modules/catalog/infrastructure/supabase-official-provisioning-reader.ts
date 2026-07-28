import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface ProvisionableClub {
  id: string;
  name: string;
  catalog: { sourceCode: string; revision: string; published: boolean; ready: boolean } | null;
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

    return Promise.all(clubs.map(async (club) => {
      const { data: catalog, error: catalogError } = await supabase.from("catalogs").select("id, source_catalog_code").eq("club_id", club.id).eq("source_catalog_code", "amigo.regular").maybeSingle();
      // A catalog lookup is deliberately informational: unavailable/absent provenance is not an error state.
      if (catalogError || !catalog) return { ...club, catalog: null };
      const { data: version, error: versionError } = await supabase.from("catalog_versions").select("source_revision_key, status").eq("catalog_id", catalog.id).eq("source_revision_key", "dsa-amigo-official-card-es-undated").maybeSingle();
      if (versionError || !version) return { ...club, catalog: null };
      return { ...club, catalog: { sourceCode: catalog.source_catalog_code, revision: version.source_revision_key, published: version.status === "published", ready: version.status === "published" } };
    }));
  }
}
