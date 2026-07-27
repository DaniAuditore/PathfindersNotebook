"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { SupabaseOfficialAmigoEnrollment } from "../infrastructure/supabase-official-amigo-enrollment";
import { requireRole } from "@/shared/auth/session";
import { writeActionLog } from "@/shared/observability/action-log";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const schema = z.object({ studentId: z.uuid() });
const messages = {
  created: "Student enrolled in official regular Amigo for this year.",
  existing: "Student is already enrolled in official regular Amigo for this year.",
  error: "Official Amigo enrollment could not be completed.",
} as const;

export async function enrollOfficialAmigoStudentAction(input: unknown) {
  const command = schema.parse(input);
  const schoolYear = new Date().getFullYear();
  const supabase = await createSupabaseServerClient();
  const { data: student, error } = await supabase.from("students").select("club_id").eq("id", command.studentId).maybeSingle();
  if (error || !student) throw new Error("Eligible student not found.");

  // Student identity is untrusted input. Resolve its club first, then re-authorize.
  const actor = await requireRole(student.club_id, ["admin"]);
  const result = await new SupabaseOfficialAmigoEnrollment().enrollStudent(command.studentId, actor.id, schoolYear);
  if (!result.existing) {
    await writeActionLog({ clubId: student.club_id, actorId: actor.id, action: "enrollment.official_amigo_created", entityType: "enrollment", entityId: result.enrollmentId, metadata: { schoolYear } });
  }
  return result;
}

export async function enrollOfficialAmigoStudentFormAction(formData: FormData) {
  let destination = `/enrollments?error=${encodeURIComponent(messages.error)}`;
  try {
    const result = await enrollOfficialAmigoStudentAction({ studentId: formData.get("studentId") });
    revalidatePath("/enrollments");
    revalidatePath(`/students/${result.studentId}`);
    destination = `/enrollments?message=${encodeURIComponent(result.existing ? messages.existing : messages.created)}`;
  } catch {
    // Do not expose authorization or database detail from this administrative form.
  }
  redirect(destination);
}
