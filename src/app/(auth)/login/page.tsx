import { loginAction } from "../actions";
import { cookies } from "next/headers";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const recoveryEmail = (await cookies()).get("login_recovery_email")?.value ?? "";
  return (
    <main className="page">
      <PageHeader title="Iniciar sesión" description="Usá el correo y la contraseña proporcionados por tu club." />
      {error ? <Notice kind="error" focusOnRender message="No pudimos iniciar sesión. Verifique su correo y contraseña e inténtelo de nuevo." /> : null}
      <form action={loginAction}>
        <div className="card stack"><div className="form-field"><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" autoComplete="email" defaultValue={recoveryEmail} required /></div><div className="form-field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div><SubmitButton pendingLabel="Iniciando sesión…">Iniciar sesión</SubmitButton></div>
      </form>
    </main>
  );
}
