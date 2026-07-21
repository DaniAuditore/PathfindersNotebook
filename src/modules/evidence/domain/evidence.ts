export const ALLOWED_EVIDENCE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export type EvidenceMimeType = (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number];
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_DOWNLOAD_TTL_SECONDS = 5 * 60;
