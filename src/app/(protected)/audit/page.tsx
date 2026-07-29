import Link from "next/link";
import { notFound } from "next/navigation";

import { decodeAuditCursor, SupabaseAuditReader } from "@/modules/audit/infrastructure/supabase-audit-reader";
import { requireSession } from "@/shared/auth/session";
import { AuditTimeline } from "@/shared/ui/audit-timeline";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const actor = await requireSession();
  const params = await searchParams;
  const page = await new SupabaseAuditReader().timeline(actor.id, decodeAuditCursor(params.cursor));
  if (!page) notFound();
  return <><PageHeader title="Auditoría" description="Registro reducido de acciones en los clubes donde tienes alcance." />
    {page.entries.length === 0 ? <EmptyState title="No hay acciones para mostrar"><p>El registro no muestra identidades, identificadores ni detalles de solicitudes.</p></EmptyState> : <AuditTimeline entries={page.entries} />}
    {page.nextCursor ? <p><Link href={`/audit?cursor=${encodeURIComponent(page.nextCursor)}`}>Ver acciones anteriores</Link></p> : null}
  </>;
}
