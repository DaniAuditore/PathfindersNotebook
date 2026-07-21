import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface ActionLogEntry {
  clubId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEYS = /name|email|phone|birth|address|evidence|token|cookie|authorization|password/i;

export function scrubActionMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (SENSITIVE_KEYS.test(key)) return [];
      if (typeof value === "string" && value.length > 256) return [[key, "[truncated]"]];
      return [[key, value]];
    }),
  );
}

export async function writeActionLog(entry: ActionLogEntry): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("audit_log").insert({
    club_id: entry.clubId,
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    metadata: scrubActionMetadata(entry.metadata),
  });

  if (error) throw new Error("Unable to record the protected action audit event.");
}
