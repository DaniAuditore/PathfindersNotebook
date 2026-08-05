import type { NextRequest } from "next/server";

import { redirectWithRefreshedCookies, refreshSupabaseSession } from "@/shared/supabase/proxy";

const protectedPrefixes = ["/dashboard", "/students", "/reviews", "/enrollments", "/classes", "/club", "/members", "/audit", "/assessments", "/profile", "/operaciones-no-disponibles"];

export async function proxy(request: NextRequest) {
  const { response, user, credentialGate } = await refreshSupabaseSession(request);
  const path = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  if (isProtected && !user) {
    return redirectWithRefreshedCookies(new URL("/login", request.url), response);
  }
  if (user && credentialGate === "DENY") {
    return redirectWithRefreshedCookies(new URL("/login?error=login", request.url), response);
  }
  if (user && credentialGate === "CHANGE_PASSWORD" && path !== "/change-password") {
    return redirectWithRefreshedCookies(new URL("/change-password", request.url), response);
  }
  if (path === "/change-password" && user && credentialGate === "ALLOW") {
    return redirectWithRefreshedCookies(new URL("/dashboard", request.url), response);
  }
  if (path === "/login" && user) {
    return redirectWithRefreshedCookies(new URL("/dashboard", request.url), response);
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/students/:path*", "/reviews/:path*", "/enrollments/:path*", "/classes/:path*", "/club/:path*", "/members/:path*", "/audit/:path*", "/assessments/:path*", "/profile/:path*", "/operaciones-no-disponibles/:path*", "/change-password", "/login"],
};
