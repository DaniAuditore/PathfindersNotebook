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
  if (error || !data.user) return { response, user: null, credentialGate: "DENY" as const };
  // The v2 gate applies exclusively to server-created private aliases. Legacy
  // email accounts stay operational until the explicitly deferred cutover.
  if (!data.user.email?.endsWith("@members.invalid")) return { response, user: data.user, credentialGate: "ALLOW" as const };
  const { data: credentialGate } = await supabase.rpc("credential_gate_status");
  return { response, user: data.user, credentialGate: credentialGate === "ALLOW" || credentialGate === "CHANGE_PASSWORD" ? credentialGate : "DENY" as const };
}

export function redirectWithRefreshedCookies(url: URL, refreshedResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  refreshedResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}
