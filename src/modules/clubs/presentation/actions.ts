"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const clubSchema = z.object({ clubId: z.uuid(), name: z.string().trim().min(1).max(160) });

export async function updateClubAction(input: unknown) {
  const command = clubSchema.parse(input);
  await requireRole(command.clubId, ["CLUB_DIRECTOR"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_club", { target_club_id: command.clubId, name_input: command.name });
  if (error) throw new Error("No fue posible actualizar el club.");
}

export async function updateClubFormAction(formData: FormData) {
  let destination = "/club?error=No+fue+posible+actualizar+el+club.";
  try {
    await updateClubAction({ clubId: formData.get("clubId"), name: formData.get("name") });
    revalidatePath("/club");
    revalidatePath("/dashboard");
    destination = "/club?message=Club+actualizado.";
  } catch {
    // Command errors remain server-confidential.
  }
  redirect(destination);
}
