"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { SupabaseCatalogFacade } from "../infrastructure/supabase-catalog-facade";
import { ProvisionOfficialCatalog } from "../application/provision-official-catalog";
import amigoRegularSnapshot from "../infrastructure/official/amigo-regular.es.json";
import { requireRole } from "@/shared/auth/session";

const publishCatalogSchema = z.object({
  clubId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  type: z.enum(["regular", "advanced"]),
});

export async function publishCatalogAction(input: unknown) {
  const command = publishCatalogSchema.parse(input);
  await requireRole(command.clubId, ["CLUB_DIRECTOR"]);
  const catalog = await new SupabaseCatalogFacade().publishDraft(command);

  return catalog;
}

const provisionOfficialSchema = z.object({ clubId: z.uuid() });

export async function provisionOfficialAmigoAction(input: unknown) {
  const command = provisionOfficialSchema.parse(input);
  await requireRole(command.clubId, ["CLUB_DIRECTOR"]);
  const result = await new ProvisionOfficialCatalog(new SupabaseCatalogFacade()).execute({
    clubId: command.clubId,
    snapshot: amigoRegularSnapshot,
  });

  if (!result.ok) return result;

  return result;
}

const provisionMessages = {
  success: "Official regular Amigo is ready for this club.",
  conflict: "Official regular Amigo could not be provisioned because the published catalog conflicts with the canonical release.",
  error: "Official regular Amigo could not be provisioned. Try again or contact an administrator.",
} as const;

/** Form boundary for the operational UI; authorization remains in provisionOfficialAmigoAction. */
export async function provisionOfficialAmigoFormAction(formData: FormData) {
  let destination = `/classes?error=${encodeURIComponent(provisionMessages.error)}`;

  try {
    const result = await provisionOfficialAmigoAction({ clubId: formData.get("clubId") });
    if (result.ok) {
      revalidatePath("/classes");
      destination = `/classes?message=${encodeURIComponent(provisionMessages.success)}`;
    } else if (result.error.code === "provision_conflict") {
      destination = `/classes?error=${encodeURIComponent(provisionMessages.conflict)}`;
    }
  } catch {
    // Keep the public operational result stable; authorization and database details stay server-side.
  }

  redirect(destination);
}
