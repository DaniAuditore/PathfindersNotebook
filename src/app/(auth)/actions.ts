"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/shared/supabase/server";

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1_000),
});

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/login?error=Enter+a+valid+email+and+password.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/login?error=The+email+or+password+is+incorrect.");
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/dashboard?error=Sign+out+failed.+You+are+still+signed+in.+Please+try+again.");
  redirect("/login");
}
