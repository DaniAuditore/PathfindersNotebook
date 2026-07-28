export interface AuditTimelineEntry { id: string; action: string; entityType: string; occurredAt: string; actorLabel: "Usuario autorizado" | "Sistema"; }

/** Intentionally accepts only the redacted audit projection. */
export function AuditTimeline({ entries }: { entries: readonly AuditTimelineEntry[] }) {
  return <ol className="audit-timeline">{entries.map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>{entry.entityType}</span><time dateTime={entry.occurredAt}>{new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.occurredAt))}</time><span>{entry.actorLabel}</span></li>)}</ol>;
}
