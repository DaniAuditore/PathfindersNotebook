import type { ClassType } from "../domain/class-type";
import type { CatalogDraft, OfficialPublishedCatalogVersion, PublishedCatalogVersion } from "../domain/catalog";
import type { OfficialRegularAmigoSnapshot } from "../domain/official-template";

export interface ProvisionOfficialCatalogError {
  code: "database_error" | "official_snapshot_invalid" | "provision_conflict" | "unauthorized";
  message: string;
  details?: readonly { code: string; path: string; message: string }[];
}

export type ProvisionOfficialCatalogResult =
  | { ok: true; value: OfficialPublishedCatalogVersion }
  | { ok: false; error: ProvisionOfficialCatalogError };

export interface ProvisionOfficialCatalogPort {
  provisionOfficial(
    clubId: string,
    snapshot: OfficialRegularAmigoSnapshot,
  ): Promise<ProvisionOfficialCatalogResult>;
}

export interface CatalogSummary {
  id: string;
  type: ClassType;
  title: string;
}

/** Public application boundary consumed by routes and other modules. */
export interface CatalogFacade extends ProvisionOfficialCatalogPort {
  listPublished(clubId: string): Promise<readonly CatalogSummary[]>;
  publishDraft(draft: CatalogDraft): Promise<PublishedCatalogVersion>;
}
