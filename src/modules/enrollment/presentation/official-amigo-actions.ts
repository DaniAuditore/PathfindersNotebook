"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { OfficialAmigoEnrollmentFailure, SupabaseOfficialAmigoEnrollment } from "../infrastructure/supabase-official-amigo-enrollment";
import { requireRole } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const schema = z.object({ studentId: z.uuid() });
const messages = {
  created: "El alumno quedó inscrito en Amigo regular oficial para este año.",
  existing: "El alumno ya estaba inscrito en Amigo regular oficial para este año.",
  error: "No fue posible completar la inscripción oficial de Amigo.",
} as const;

export async function enrollOfficialAmigoStudentAction(input: unknown) {
  const command = schema.parse(input);
  const schoolYear = new Date().getFullYear();
  const supabase = await createSupabaseServerClient();
  const { data: student, error } = await supabase.from("students").select("club_id").eq("id", command.studentId).maybeSingle();
  if (error || !student) throw new Error("Eligible student not found.");

  // Student identity is untrusted input. Resolve its club first, then re-authorize.
  await requireRole(student.club_id, ["CLUB_DIRECTOR"]);
  const result = await new SupabaseOfficialAmigoEnrollment().enrollStudent(command.studentId, schoolYear);
  return result;
}

export async function enrollOfficialAmigoStudentFormAction(formData: FormData) {
  let destination = `/enrollments?error=${encodeURIComponent(messages.error)}`;
  try {
    const result = await enrollOfficialAmigoStudentAction({ studentId: formData.get("studentId") });
    revalidatePath("/enrollments");
    revalidatePath(`/students/${result.studentId}`);
    destination = `/enrollments?message=${encodeURIComponent(result.existing ? messages.existing : messages.created)}&studentId=${encodeURIComponent(result.studentId)}`;
  } catch (error) {
    // Do not expose authorization or database detail from this administrative form.
    logEnrollmentFailure(error);
  }
  redirect(destination);
}

function logEnrollmentFailure(error: unknown): void {
  const failure = error instanceof OfficialAmigoEnrollmentFailure
    ? { code: failureCode(error), context: error.diagnosticContext }
    : { code: "official_amigo_enrollment_unexpected", context: {} };
  console.error({ event: "official_amigo_enrollment_failed", ...failure });
}

function failureCode(error: OfficialAmigoEnrollmentFailure): string {
  return /^[a-z0-9_]+$/i.test(error.diagnosticCode)
    ? error.diagnosticCode
    : "official_amigo_enrollment_unexpected";
}
