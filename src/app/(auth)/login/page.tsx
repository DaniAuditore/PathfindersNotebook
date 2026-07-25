import { loginAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main>
      <h1>Sign in</h1>
      <p>Use the email and password provided by your club.</p>
      {error ? <p role="alert">{error}</p> : null}
      <form action={loginAction}>
        <p><label>Email<br /><input name="email" type="email" autoComplete="email" required /></label></p>
        <p><label>Password<br /><input name="password" type="password" autoComplete="current-password" required /></label></p>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
