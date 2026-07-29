import { SupabaseProfileReader } from "@/modules/identity/infrastructure/supabase-profile-reader";
import { updateOwnProfileFormAction } from "@/modules/identity/presentation/actions";
import { requireSession } from "@/shared/auth/session";
import { ActionResult } from "@/shared/ui/action-result";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [profile, notice] = await Promise.all([new SupabaseProfileReader().ownProfile(actor.id), searchParams]);
  return <><PageHeader title="Mi perfil" description="Actualiza el nombre que se muestra en tu espacio de trabajo." />
    {notice.message ? <ActionResult kind="success" message={notice.message} /> : null}{notice.error ? <ActionResult kind="error" message="No fue posible actualizar el perfil. Inténtalo de nuevo." /> : null}
    {!profile ? <EmptyState title="Perfil no disponible"><p>Contacta al responsable autorizado de tu club.</p></EmptyState> : <form className="card form-stack" action={updateOwnProfileFormAction}><p className="form-field"><label htmlFor="displayName">Nombre visible</label><input id="displayName" name="displayName" defaultValue={profile.displayName} required maxLength={120} /></p><SubmitButton pendingLabel="Guardando…">Guardar perfil</SubmitButton></form>}
  </>;
}
