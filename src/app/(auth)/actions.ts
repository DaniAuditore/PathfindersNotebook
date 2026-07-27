"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";

import { createSupabaseServerClient } from "@/shared/supabase/server";

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1_000),
});

const recoveryEmailSchema = z.string().trim().max(320);
const loginRecoveryCookie = "login_recovery_email";

async function preserveRecoveryEmail(formData: FormData) {
  const email = recoveryEmailSchema.safeParse(formData.get("email"));
  if (!email.success) return;

  const cookieStore = await cookies();
  cookieStore.set(loginRecoveryCookie, email.data, {
    httpOnly: true,
    maxAge: 5 * 60,
    path: "/login",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function clearRecoveryEmail() {
  const cookieStore = await cookies();
  cookieStore.set(loginRecoveryCookie, "", { maxAge: 0, path: "/login" });
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    await preserveRecoveryEmail(formData);
    redirect("/login?error=login");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await preserveRecoveryEmail(formData);
    redirect("/login?error=login");
  }
  await clearRecoveryEmail();
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/dashboard?error=Sign+out+failed.+You+are+still+signed+in.+Please+try+again.");
  redirect("/login");
}
