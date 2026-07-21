"use server";

import { z } from "zod";

import { SupabaseCatalogFacade } from "../infrastructure/supabase-catalog-facade";
import { requireRole } from "@/shared/auth/session";
import { writeActionLog } from "@/shared/observability/action-log";

const publishCatalogSchema = z.object({
  clubId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  type: z.enum(["regular", "advanced"]),
});

export async function publishCatalogAction(input: unknown) {
  const command = publishCatalogSchema.parse(input);
  const actor = await requireRole(command.clubId, ["admin"]);
  const catalog = await new SupabaseCatalogFacade().publishDraft(command);

  await writeActionLog({
    clubId: command.clubId,
    actorId: actor.id,
    action: "catalog.published",
    entityType: "catalog_version",
    entityId: catalog.versionId,
    metadata: { catalogId: catalog.catalogId, versionNumber: catalog.versionNumber, type: command.type },
  });

  return catalog;
}
