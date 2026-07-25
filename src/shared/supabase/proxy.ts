import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) throw new Error("Missing Supabase server configuration.");
  return { url, publishableKey };
}

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = configuration();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // This server round-trip validates the token and refreshes expired cookies.
  const { data, error } = await supabase.auth.getUser();
  return { response, user: error ? null : data.user };
}

export function redirectWithRefreshedCookies(url: URL, refreshedResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  refreshedResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}
