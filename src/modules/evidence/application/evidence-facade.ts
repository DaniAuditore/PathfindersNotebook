import type { EvidenceMimeType } from "../domain/evidence";

export interface PrepareEvidenceUploadCommand {
  progressId: string;
  mimeType: EvidenceMimeType;
  byteSize: number;
}

export interface EvidenceFacade {
  prepareUpload(command: PrepareEvidenceUploadCommand): Promise<{ evidenceId: string; objectPath: string }>;
  getDownload(evidenceId: string): Promise<{ clubId: string; objectPath: string }>;
  prepareDeletion(evidenceId: string): Promise<{ clubId: string; objectPath: string }>;
  finalizeDeletion(evidenceId: string): Promise<{ clubId: string }>;
  setLegalHold(evidenceId: string, hold: boolean): Promise<{ clubId: string }>;
}
