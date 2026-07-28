import Link from "next/link";

import { provisionOfficialAmigoFormAction } from "@/modules/catalog/presentation/actions";
import { SupabaseOfficialProvisioningReader } from "@/modules/catalog/infrastructure/supabase-official-provisioning-reader";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { ActionResult } from "@/shared/ui/action-result";
import { DataSummary } from "@/shared/ui/data-summary";
import { DeferredState } from "@/shared/ui/deferred-state";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [clubs, notice] = await Promise.all([
    new SupabaseOfficialProvisioningReader().listAdminClubs(actor.id),
    searchParams,
  ]);

  return (
    <><PageHeader title="Preparación oficial de Amigo" description="Prepara el catálogo oficial, regular e inmutable de Amigo para un club que administras. No es creación genérica de catálogos." />
      {notice.message ? <ActionResult kind="success" message={notice.message} /> : null}{notice.error ? <ActionResult kind="error" message="No fue posible preparar el catálogo. Inténtalo de nuevo." /> : null}
      {clubs.length === 0 ? <EmptyState title="No hay clubes disponibles"><p>Se necesita una membresía de dirección de club para preparar Amigo oficial.</p></EmptyState> : <div className="grid">{clubs.map((club) => <Card key={club.id}><h2>{club.name}</h2>
              {club.catalog ? <DataSummary items={[{ label: "Fuente oficial", value: club.catalog.sourceCode }, { label: "Revisión", value: club.catalog.revision }, { label: "Publicación", value: club.catalog.published ? "Publicada" : "Pendiente" }, { label: "Preparación", value: club.catalog.ready ? "Lista para inscripciones" : "Aún no disponible" }]} /> : <p>El catálogo oficial todavía no está preparado.</p>}
              <form action={provisionOfficialAmigoFormAction}>
                <input type="hidden" name="clubId" value={club.id} />
                <SubmitButton pendingLabel="Preparando catálogo…">Preparar Amigo regular oficial</SubmitButton>
              </form>
            </Card>)}</div>}<DeferredState title="Contenido y evidencias no disponibles">La edición de contenido, la carga de evidencia y las exportaciones no están disponibles desde esta pantalla.</DeferredState><p><Link href="/dashboard">Abrir panel de alumnos</Link></p>
    </>
  );
}
