"use server";

import { z } from "zod";

import { ALLOWED_EVIDENCE_MIME_TYPES, MAX_EVIDENCE_BYTES } from "../domain/evidence";
import { SupabaseEvidenceFacade } from "../infrastructure/supabase-evidence-facade";
import { requireSession } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const uploadSchema = z.object({ progressId: z.uuid(), mimeType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES), byteSize: z.int().positive().max(MAX_EVIDENCE_BYTES) });
const deletionSchema = z.object({ evidenceId: z.uuid() });
const legalHoldSchema = z.object({ evidenceId: z.uuid(), hold: z.boolean() });

export async function prepareEvidenceUploadAction(input: unknown) {
  const command = uploadSchema.parse(input);
  await requireSession();
  return new SupabaseEvidenceFacade().prepareUpload(command);
}

export async function deleteExpiredEvidenceAction(input: unknown) {
  const { evidenceId } = deletionSchema.parse(input);
  await requireSession();
  const facade = new SupabaseEvidenceFacade();
  const { objectPath } = await facade.prepareDeletion(evidenceId);
  const supabase = await createSupabaseServerClient();
  const { error: storageError } = await supabase.storage.from("evidence").remove([objectPath]);
  if (storageError) throw new Error("Unable to remove private evidence.");
  await facade.finalizeDeletion(evidenceId);
}

export async function setEvidenceLegalHoldAction(input: unknown) {
  const { evidenceId, hold } = legalHoldSchema.parse(input);
  await requireSession();
  await new SupabaseEvidenceFacade().setLegalHold(evidenceId, hold);
}
