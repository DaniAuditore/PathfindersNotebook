"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const studentSchema = z.object({
  studentId: z.uuid().nullable(),
  clubId: z.uuid(),
  displayName: z.string().trim().min(1).max(120),
  birthYear: z.number().int().min(1900).max(2100).nullable(),
});

export async function saveStudentAction(input: unknown) {
  const command = studentSchema.parse(input);
  if (command.studentId) {
    const supabase = await createSupabaseServerClient();
    const { data: student, error } = await supabase.from("students").select("club_id").eq("id", command.studentId).maybeSingle();
    if (error || !student || student.club_id !== command.clubId) throw new Error("El alumno no está disponible en este club.");
  }
  await requireRole(command.clubId, ["CLUB_DIRECTOR", "INSTRUCTOR"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_or_update_student", {
    target_student_id: command.studentId,
    target_club_id: command.clubId,
    display_name_input: command.displayName,
    birth_year_input: command.birthYear,
    guardian_user_id_input: null,
    student_user_id_input: null,
  });
  if (error) throw new Error("No fue posible guardar el alumno.");
}

export async function saveStudentFormAction(formData: FormData) {
  let destination = "/students?error=No+fue+posible+guardar+el+alumno.";
  try {
    const birthYearValue = String(formData.get("birthYear") ?? "").trim();
    await saveStudentAction({
      studentId: formData.get("studentId") || null,
      clubId: formData.get("clubId"),
      displayName: formData.get("displayName"),
      birthYear: birthYearValue ? Number(birthYearValue) : null,
    });
    revalidatePath("/students");
    revalidatePath("/dashboard");
    destination = "/students?message=Alumno+guardado.";
  } catch {
    // The generic result preserves scope and validation confidentiality.
  }
  redirect(destination);
}
