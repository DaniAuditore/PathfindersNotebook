import Link from "next/link";

import { provisionOfficialAmigoFormAction } from "@/modules/catalog/presentation/actions";
import { SupabaseOfficialProvisioningReader } from "@/modules/catalog/infrastructure/supabase-official-provisioning-reader";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [clubs, notice] = await Promise.all([
    new SupabaseOfficialProvisioningReader().listAdminClubs(actor.id),
    searchParams,
  ]);

  return (
    <><PageHeader title="Preparación oficial de Amigo" description="Prepará el catálogo oficial regular e inmutable de Amigo para un club que administrás. No es creación genérica de catálogos." />
      {notice.message ? <Notice kind="success" message={notice.message} /> : null}{notice.error ? <Notice kind="error" message="No pudimos preparar el catálogo. Intentá de nuevo." /> : null}
      {clubs.length === 0 ? <EmptyState title="No hay clubes disponibles"><p>Necesitás una membresía de administrador en un club para preparar Amigo oficial.</p></EmptyState> : <div className="grid">{clubs.map((club) => <Card key={club.id}><h2>{club.name}</h2>
              <form action={provisionOfficialAmigoFormAction}>
                <input type="hidden" name="clubId" value={club.id} />
                <SubmitButton pendingLabel="Preparando catálogo…">Preparar Amigo regular oficial</SubmitButton>
              </form>
            </Card>)}</div>}<p><Link href="/dashboard">Abrir panel de alumnos</Link></p>
    </>
  );
}
