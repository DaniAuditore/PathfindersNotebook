import type { NextRequest } from "next/server";

import { redirectWithRefreshedCookies, refreshSupabaseSession } from "@/shared/supabase/proxy";

const protectedPrefixes = ["/dashboard", "/students", "/reviews", "/enrollments", "/classes"];

export async function proxy(request: NextRequest) {
  const { response, user } = await refreshSupabaseSession(request);
  const path = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  if (isProtected && !user) {
    return redirectWithRefreshedCookies(new URL("/login", request.url), response);
  }
  if (path === "/login" && user) {
    return redirectWithRefreshedCookies(new URL("/dashboard", request.url), response);
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/students/:path*", "/reviews/:path*", "/enrollments/:path*", "/classes/:path*", "/login"],
};
