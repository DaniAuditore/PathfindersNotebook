import "server-only";

import type {
  CatalogFacade,
  CatalogSummary,
  ProvisionOfficialCatalogResult,
} from "../application/catalog-facade";
import type { CatalogDraft, PublishedCatalogVersion } from "../domain/catalog";
import type { OfficialRegularAmigoSnapshot } from "../domain/official-template";
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
    const { data, error } = await supabase.rpc("publish_catalog_draft", {
      target_club_id: draft.clubId,
      class_type_input: draft.type,
      title_input: draft.title,
    });
    if (error || !isProvisionResponse(data)) throw new Error("Unable to publish the catalog version.");
    return data;
  }

  async provisionOfficial(
    clubId: string,
    snapshot: OfficialRegularAmigoSnapshot,
  ): Promise<ProvisionOfficialCatalogResult> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("provision_official_amigo_catalog", {
      target_club_id: clubId,
      snapshot,
    });

    if (error) {
      const unauthorized = error.code === "42501";
      const conflict = error.code === "23505" || error.code === "23514" || error.code === "P0001";
      return {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : conflict ? "provision_conflict" : "database_error",
          message: error.message || "Unable to provision the official regular-Amigo catalog.",
        },
      };
    }

    if (!isProvisionResponse(data)) {
      return {
        ok: false,
        error: {
          code: "database_error",
          message: "Official catalog provisioning returned an invalid database response.",
        },
      };
    }

    return { ok: true, value: data };
  }
}

function isProvisionResponse(value: unknown): value is {
  catalogId: string;
  versionId: string;
  versionNumber: number;
} {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.catalogId === "string"
    && typeof candidate.versionId === "string"
    && Number.isInteger(candidate.versionNumber);
}
