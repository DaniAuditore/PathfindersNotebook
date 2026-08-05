import { loginAction } from "../actions";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="page">
      <PageHeader title="Iniciar sesión" description="Use el nombre de usuario y la contraseña proporcionados por su club." />
      {error ? <Notice kind="error" focusOnRender message="No se pudo iniciar sesión. Verifique los datos e intente de nuevo." /> : null}
      <form action={loginAction}>
        <div className="card stack"><div className="form-field"><label htmlFor="identifier">Nombre de usuario</label><input id="identifier" name="identifier" type="text" autoComplete="username" required /></div><div className="form-field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div><SubmitButton pendingLabel="Iniciando sesión…">Iniciar sesión</SubmitButton></div>
      </form>
    </main>
  );
}
