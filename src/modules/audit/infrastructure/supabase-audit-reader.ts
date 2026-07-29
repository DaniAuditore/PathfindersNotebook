import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AuditTimelinePage } from "../application/audit-read-model";

const pageSize = 25;
type AuditCursor = { createdAt: string; id: string };

export function decodeAuditCursor(value: string | undefined): AuditCursor | null {
  if (!value || value.length > 256) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof parsed.createdAt === "string" && !Number.isNaN(Date.parse(parsed.createdAt)) && typeof parsed.id === "string" && /^[0-9a-f-]{36}$/i.test(parsed.id) ? parsed : null;
  } catch {
    return null;
  }
}

function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export class SupabaseAuditReader {
  async timeline(actorId: string, cursor: AuditCursor | null): Promise<AuditTimelinePage | null> {
    const supabase = await createSupabaseServerClient();
    const { data: assignments, error: assignmentError } = await supabase.from("role_assignments").select("club_id").eq("user_id", actorId).is("revoked_at", null).in("role", ["CLUB_DIRECTOR", "INSTRUCTOR"]);
    if (assignmentError) throw new Error("No fue posible cargar el alcance de auditoría.");
    const clubIds = (assignments ?? []).flatMap((assignment) => assignment.club_id ? [assignment.club_id] : []);
    if (clubIds.length === 0) return null;

    let query = supabase.from("audit_log").select("id, action, entity_type, actor_id, created_at").in("club_id", clubIds).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw new Error("No fue posible cargar la auditoría.");
    const rows = data ?? [];
    const visibleRows = rows.slice(0, pageSize);
    const last = visibleRows.at(-1);
    return {
      entries: visibleRows.map((row) => ({ id: row.id, action: row.action, entityType: row.entity_type, occurredAt: row.created_at, actorLabel: row.actor_id ? "Usuario autorizado" : "Sistema" })),
      nextCursor: rows.length > pageSize && last ? encodeAuditCursor({ createdAt: last.created_at, id: last.id }) : null,
    };
  }
}
