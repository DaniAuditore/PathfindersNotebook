import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  cookieStore: { get: vi.fn(), set: vi.fn() },
  cookies: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); }),
  resolveInternalUsername: vi.fn(),
  issueInitialPasswordChangeToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/modules/identity/infrastructure/supabase-auth-admin", () => ({
  resolveInternalUsername: mocks.resolveInternalUsername,
  issueInitialPasswordChangeToken: mocks.issueInitialPasswordChangeToken,
}));

import { changeInitialPasswordAction, loginAction, signOutAction } from "@/app/(auth)/actions";
import LoginPage from "@/app/(auth)/login/page";
import { proxy } from "@/proxy";

describe("authentication actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
    mocks.resolveInternalUsername.mockResolvedValue({ authUserId: "member", alias: "m.11111111-1111-4111-8111-111111111111@members.invalid" });
  });

  it("signs in valid credentials and redirects to the dashboard", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword }, rpc: vi.fn().mockResolvedValue({ data: "ALLOW" }) });
    const form = new FormData();
    form.set("identifier", "learner");
    form.set("password", "secret");

    await expect(loginAction(form)).rejects.toThrow("REDIRECT:/dashboard");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: expect.stringMatching(/@members\.invalid$/), password: "secret" });
  });

  it("does not place failed-login credentials in the redirect URL", async () => {
    mocks.resolveInternalUsername.mockResolvedValue(null);
    const form = new FormData();
    form.set("identifier", "no");
    form.set("password", "secret-value");

    await expect(loginAction(form)).rejects.toThrow("REDIRECT:/login?error=login");
    expect(mocks.redirect).toHaveBeenLastCalledWith("/login?error=login");
    expect(mocks.redirect.mock.calls.flat().join(" ")).not.toContain("secret-value");
  });

  it("invalidates the session before redirecting to login", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signOut } });

    await expect(signOutAction()).rejects.toThrow("REDIRECT:/login");
    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]!);
  });

  it("keeps the user in the protected UX when Supabase returns a sign-out error", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: new Error("provider unavailable") });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signOut } });

    await expect(signOutAction()).rejects.toThrow(
      "REDIRECT:/dashboard?error=Sign+out+failed.+You+are+still+signed+in.+Please+try+again.",
    );
    expect(signOut).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalledWith("/login");
  });

  it("completes the database credential gate only after Auth accepts the new password", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.cookieStore.get.mockReturnValue({ value: "opaque-change-token" });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { updateUser }, rpc });
    const form = new FormData();
    form.set("password", "a-safe-initial-password");
    form.set("passwordConfirmation", "a-safe-initial-password");

    await expect(changeInitialPasswordAction(form)).rejects.toThrow("REDIRECT:/dashboard");
    expect(updateUser).toHaveBeenCalledWith({ password: "a-safe-initial-password" });
    expect(rpc).toHaveBeenCalledWith("complete_initial_password_change", { change_token: "opaque-change-token" });
    expect(mocks.cookieStore.set).toHaveBeenCalledWith("initial_password_change_token", "", { maxAge: 0, path: "/change-password" });
  });
});

describe("login presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
  });

  it("keeps the password blank and focuses the generic error", async () => {
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "login" }) }));

    expect(html).toContain('name="identifier"');
    expect(html).toContain('name="password"');
    expect(html).not.toContain('name="password" value=');
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("No se pudo iniciar sesión.");
  });
});

describe("session proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  });

  function session(user: { id: string; email?: string } | null, credentialGate = "ALLOW") {
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([{ name: "refreshed", value: "token", options: { httpOnly: true, path: "/" } }]);
      return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc: vi.fn().mockResolvedValue({ data: user ? credentialGate : null }) };
    });
  }

  it("redirects anonymous protected requests and preserves refreshed cookies", async () => {
    session(null);
    const response = await proxy(new NextRequest("http://localhost/dashboard"));

    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(response.cookies.get("refreshed")?.value).toBe("token");
  });

  it("redirects an authenticated login request to the dashboard with refreshed cookies", async () => {
    session({ id: "actor" });
    const response = await proxy(new NextRequest("http://localhost/login"));

    expect(response.headers.get("location")).toBe("http://localhost/dashboard");
    expect(response.cookies.get("refreshed")?.value).toBe("token");
  });

  it("passes an authenticated protected request through after refresh", async () => {
    session({ id: "actor" });
    const response = await proxy(new NextRequest("http://localhost/students/student-a"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("refreshed")?.value).toBe("token");
  });

  it("sends a pending internal credential from member operations to password change", async () => {
    session({ id: "member", email: "m.11111111-1111-4111-8111-111111111111@members.invalid" }, "CHANGE_PASSWORD");
    const response = await proxy(new NextRequest("http://localhost/members"));

    expect(response.headers.get("location")).toBe("http://localhost/change-password");
    expect(response.cookies.get("refreshed")?.value).toBe("token");
  });

  it("leaves anonymous login and password-change paths available", async () => {
    session(null);

    const [login, passwordChange] = await Promise.all([
      proxy(new NextRequest("http://localhost/login")),
      proxy(new NextRequest("http://localhost/change-password")),
    ]);

    expect(login.headers.get("location")).toBeNull();
    expect(passwordChange.headers.get("location")).toBeNull();
  });
});
