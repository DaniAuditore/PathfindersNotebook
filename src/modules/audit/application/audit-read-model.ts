export interface AuditTimelinePage {
  entries: readonly {
    id: string;
    action: string;
    entityType: string;
    occurredAt: string;
    actorLabel: "Usuario autorizado" | "Sistema";
  }[];
  nextCursor: string | null;
}
