import type { ClassType } from "../domain/class-type";
import type { CatalogDraft, PublishedCatalogVersion } from "../domain/catalog";

export interface CatalogSummary {
  id: string;
  type: ClassType;
  title: string;
}

/** Public application boundary consumed by routes and other modules. */
export interface CatalogFacade {
  listPublished(clubId: string): Promise<readonly CatalogSummary[]>;
  publishDraft(draft: CatalogDraft): Promise<PublishedCatalogVersion>;
}
