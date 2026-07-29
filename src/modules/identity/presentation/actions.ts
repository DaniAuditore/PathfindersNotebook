"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const profileSchema = z.object({ displayName: z.string().trim().min(1).max(120) });

export async function updateOwnProfileAction(input: unknown) {
  const command = profileSchema.parse(input);
  await requireSession();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_own_profile", { display_name_input: command.displayName });
  if (error) throw new Error("No fue posible actualizar el perfil.");
}

export async function updateOwnProfileFormAction(formData: FormData) {
  let destination = "/profile?error=No+fue+posible+actualizar+el+perfil.";
  try {
    await updateOwnProfileAction({ displayName: formData.get("displayName") });
    revalidatePath("/profile");
    destination = "/profile?message=Perfil+actualizado.";
  } catch {
    // Do not expose authorization or database detail in the profile flow.
  }
  redirect(destination);
}
