"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";

import { createSupabaseServerClient } from "@/shared/supabase/server";
import { issueInitialPasswordChangeToken, resolveInternalUsername, type CredentialGate } from "@/modules/identity/infrastructure/supabase-auth-admin";

const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(3).max(320),
  password: z.string().min(1).max(1_000),
});
const initialChangeCookie = "initial_password_change_token";

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({ identifier: formData.get("identifier"), password: formData.get("password") });
  if (!parsed.success) redirect("/login?error=login");

  // Legacy email accounts remain available until the later authority cutover;
  // new member accounts always use the internal username branch.
  const legacyEmail = parsed.data.identifier.includes("@") ? parsed.data.identifier : null;
  const resolved = legacyEmail ? null : await resolveInternalUsername(parsed.data.identifier);
  const email = resolved?.alias ?? legacyEmail;
  if (!email) redirect("/login?error=login");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    redirect("/login?error=login");
  }
  const { data: gateResult } = resolved ? await supabase.rpc("credential_gate_status") : { data: "ALLOW" };
  const gate = gateResult as CredentialGate | null;
  if (gate === "CHANGE_PASSWORD") {
    if (!resolved) {
      await supabase.auth.signOut();
      redirect("/login?error=login");
    }
    const token = await issueInitialPasswordChangeToken(resolved.authUserId);
    const cookieStore = await cookies();
    cookieStore.set(initialChangeCookie, token, { httpOnly: true, maxAge: 15 * 60, path: "/change-password", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    redirect("/change-password");
  }
  if (gate !== "ALLOW") {
    await supabase.auth.signOut();
    redirect("/login?error=login");
  }
  redirect("/dashboard");
}

export async function changeInitialPasswordAction(formData: FormData) {
  const password = z.string().min(12).max(1_000).safeParse(formData.get("password"));
  const confirmation = z.string().max(1_000).safeParse(formData.get("passwordConfirmation"));
  const cookieStore = await cookies();
  const token = cookieStore.get(initialChangeCookie)?.value;
  if (!password.success || !confirmation.success || password.data !== confirmation.data || !token) redirect("/change-password?error=password");
  const supabase = await createSupabaseServerClient();
  const { error: updateError } = await supabase.auth.updateUser({ password: password.data });
  if (updateError) redirect("/change-password?error=password");
  const { error: completionError } = await supabase.rpc("complete_initial_password_change", { change_token: token });
  if (completionError) redirect("/change-password?error=password");
  cookieStore.set(initialChangeCookie, "", { maxAge: 0, path: "/change-password" });
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/dashboard?error=Sign+out+failed.+You+are+still+signed+in.+Please+try+again.");
  redirect("/login");
}
