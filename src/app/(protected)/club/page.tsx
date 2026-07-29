import { SupabaseClubReader } from "@/modules/clubs/infrastructure/supabase-club-reader";
import { updateClubFormAction } from "@/modules/clubs/presentation/actions";
import { requireSession } from "@/shared/auth/session";
import { ActionResult } from "@/shared/ui/action-result";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ClubPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [clubs, notice] = await Promise.all([new SupabaseClubReader().directedClubs(actor.id), searchParams]);
  return <><PageHeader title="Club" description="Actualiza únicamente los clubes donde tienes dirección activa." />
    {notice.message ? <ActionResult kind="success" message={notice.message} /> : null}{notice.error ? <ActionResult kind="error" message="No fue posible actualizar el club. Inténtalo de nuevo." /> : null}
    {clubs.length === 0 ? <EmptyState title="Sin clubes para actualizar"><p>Esta operación requiere una dirección activa del club.</p></EmptyState> : <div className="stack">{clubs.map((club) => <form className="card form-stack" action={updateClubFormAction} key={club.id}><input type="hidden" name="clubId" value={club.id} /><p className="form-field"><label htmlFor={`club-${club.id}`}>Nombre del club</label><input id={`club-${club.id}`} name="name" defaultValue={club.name} required maxLength={160} /></p><SubmitButton pendingLabel="Guardando…">Guardar club</SubmitButton></form>)}</div>}
  </>;
}
