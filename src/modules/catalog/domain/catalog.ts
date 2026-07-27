import type { ClassType } from "./class-type";

export interface CatalogDraft {
  clubId: string;
  title: string;
  type: ClassType;
}

export interface PublishedCatalogVersion {
  catalogId: string;
  versionId: string;
  versionNumber: number;
}

export type OfficialPublishedCatalogVersion = PublishedCatalogVersion;
