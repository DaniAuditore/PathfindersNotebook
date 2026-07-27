import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  cookieStore: { get: vi.fn(), set: vi.fn() },
  cookies: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { loginAction, signOutAction } from "@/app/(auth)/actions";
import LoginPage from "@/app/(auth)/login/page";
import { proxy } from "@/proxy";

describe("authentication actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
  });

  it("signs in valid credentials and redirects to the dashboard", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword } });
    const form = new FormData();
    form.set("email", "learner@example.test");
    form.set("password", "secret");

    await expect(loginAction(form)).rejects.toThrow("REDIRECT:/dashboard");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "learner@example.test", password: "secret" });
  });

  it("preserves only the entered email in a short-lived HttpOnly cookie after failed login", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: new Error("invalid") }) } });
    const form = new FormData();
    form.set("email", "learner@example.test");
    form.set("password", "wrong");

    await expect(loginAction(form)).rejects.toThrow("REDIRECT:/login?error=login");
    expect(mocks.cookieStore.set).toHaveBeenCalledWith("login_recovery_email", "learner@example.test", expect.objectContaining({ httpOnly: true, maxAge: 300, path: "/login", sameSite: "lax" }));
    expect(mocks.cookieStore.set.mock.calls.flat().join(" ")).not.toContain("wrong");
  });

  it("does not place failed-login credentials in the redirect URL", async () => {
    const form = new FormData();
    form.set("email", "not-an-email");
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
});

describe("login recovery presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
  });

  it("restores the safe email, keeps the password blank, and focuses the generic error", async () => {
    mocks.cookieStore.get.mockReturnValue({ value: "learner@example.test" });

    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "login" }) }));

    expect(html).toContain('name="email"');
    expect(html).toContain('value="learner@example.test"');
    expect(html).toContain('name="password"');
    expect(html).not.toContain('name="password" value=');
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("No pudimos iniciar sesión.");
  });
});

describe("session proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  });

  function session(user: { id: string } | null) {
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([{ name: "refreshed", value: "token", options: { httpOnly: true, path: "/" } }]);
      return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } };
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
});
