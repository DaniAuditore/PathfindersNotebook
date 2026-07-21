import "server-only";

import type { CatalogFacade, CatalogSummary } from "../application/catalog-facade";
import type { CatalogDraft, PublishedCatalogVersion } from "../domain/catalog";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export class SupabaseCatalogFacade implements CatalogFacade {
  async listPublished(clubId: string): Promise<readonly CatalogSummary[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("catalogs").select("id, class_type, title").eq("club_id", clubId);
    if (error) throw new Error("Unable to load the catalog.");

    return data.map((catalog) => ({ id: catalog.id, type: catalog.class_type, title: catalog.title }));
  }

  async publishDraft(draft: CatalogDraft): Promise<PublishedCatalogVersion> {
    const supabase = await createSupabaseServerClient();
    const { data: catalog, error: catalogError } = await supabase
      .from("catalogs")
      .insert({ club_id: draft.clubId, class_type: draft.type, title: draft.title })
      .select("id")
      .single();
    if (catalogError) throw new Error("Unable to create the catalog.");

    const { data: version, error: versionError } = await supabase
      .from("catalog_versions")
      .insert({ catalog_id: catalog.id, version_number: 1, status: "published", published_at: new Date().toISOString() })
      .select("id, version_number")
      .single();
    if (versionError) throw new Error("Unable to publish the catalog version.");

    return { catalogId: catalog.id, versionId: version.id, versionNumber: version.version_number };
  }
}
