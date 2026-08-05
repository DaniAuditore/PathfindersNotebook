import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";
import { changeInitialPasswordAction } from "../actions";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="page">
    <PageHeader title="Actualice su contraseña" description="Para continuar, elija una contraseña nueva." />
    {error ? <Notice kind="error" focusOnRender message="No se pudo actualizar la contraseña. Intente de nuevo." /> : null}
    <form action={changeInitialPasswordAction}><div className="card stack">
      <div className="form-field"><label htmlFor="password">Nueva contraseña</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} /></div>
      <div className="form-field"><label htmlFor="passwordConfirmation">Confirme la nueva contraseña</label><input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={12} /></div>
      <SubmitButton pendingLabel="Actualizando contraseña…">Continuar</SubmitButton>
    </div></form>
  </main>;
}
