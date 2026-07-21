import "server-only";

import type { EvidenceFacade, PrepareEvidenceUploadCommand } from "../application/evidence-facade";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export class SupabaseEvidenceFacade implements EvidenceFacade {
  async prepareUpload(command: PrepareEvidenceUploadCommand) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("prepare_evidence_upload", {
      target_progress_id: command.progressId,
      mime_type_input: command.mimeType,
      byte_size_input: command.byteSize,
    });
    const prepared = data?.[0];
    if (error || !prepared) throw new Error("Unable to prepare private evidence upload.");
    return { evidenceId: prepared.evidence_id, objectPath: prepared.evidence_object_path };
  }

  async getDownload(evidenceId: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("authorized_evidence_download", { target_evidence_id: evidenceId });
    const evidence = data?.[0];
    if (error || !evidence) throw new Error("Evidence is unavailable or you are not authorized to access it.");
    return { clubId: evidence.club_id, objectPath: evidence.object_path };
  }

  async finalizeDeletion(evidenceId: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("finalize_evidence_deletion", { target_evidence_id: evidenceId });
    if (error || !data) throw new Error("Evidence cannot be deleted before its retention period ends.");
    return { clubId: data };
  }

  async prepareDeletion(evidenceId: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("prepare_evidence_deletion", { target_evidence_id: evidenceId });
    const evidence = data?.[0];
    if (error || !evidence) throw new Error("Evidence cannot be deleted before its retention period ends.");
    return { clubId: evidence.club_id, objectPath: evidence.object_path };
  }

  async setLegalHold(evidenceId: string, hold: boolean) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("set_evidence_legal_hold", { target_evidence_id: evidenceId, hold_input: hold });
    if (error || !data) throw new Error("Unable to update the evidence legal hold.");
    return { clubId: data };
  }
}
