"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const assessmentSchema = z.object({ clubId: z.uuid(), enrollmentId: z.uuid(), decision: z.enum(["passed", "failed"]), comments: z.string().max(4_000).default("") });
const investitureSchema = z.object({ clubId: z.uuid(), enrollmentId: z.uuid(), rationale: z.string().trim().min(1).max(2_000) });

export async function recordAssessmentAction(input: unknown) {
  const command = assessmentSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { data: enrollment, error: enrollmentError } = await supabase.from("enrollments").select("club_id").eq("id", command.enrollmentId).maybeSingle();
  if (enrollmentError || !enrollment || enrollment.club_id !== command.clubId) throw new Error("La inscripción no está disponible en este club.");
  await requireRole(enrollment.club_id, ["CLUB_DIRECTOR", "INSTRUCTOR"]);
  const { error } = await supabase.rpc("record_assessment", { target_enrollment_id: command.enrollmentId, decision_input: command.decision, comments_input: command.comments });
  if (error) throw new Error("Unable to record this assessment.");
}

export async function recordInvestitureAction(input: unknown) {
  const command = investitureSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { data: enrollment, error: enrollmentError } = await supabase.from("enrollments").select("club_id").eq("id", command.enrollmentId).maybeSingle();
  if (enrollmentError || !enrollment || enrollment.club_id !== command.clubId) throw new Error("La inscripción no está disponible en este club.");
  await requireRole(enrollment.club_id, ["CLUB_DIRECTOR"]);
  const { error } = await supabase.rpc("record_investiture", { target_enrollment_id: command.enrollmentId, rationale_input: command.rationale });
  if (error) throw new Error("Investiture requires complete progress and a passing assessment.");
}

export async function recordAssessmentFormAction(formData: FormData) {
  let destination = "/assessments?error=No+fue+posible+registrar+la+evaluación.";
  try {
    await recordAssessmentAction({ clubId: formData.get("clubId"), enrollmentId: formData.get("enrollmentId"), decision: formData.get("decision"), comments: formData.get("comments") });
    revalidatePath("/assessments");
    destination = "/assessments?message=Evaluación+registrada.";
  } catch {
    // The RPC remains the authoritative precondition check.
  }
  redirect(destination);
}

export async function recordInvestitureFormAction(formData: FormData) {
  let destination = "/assessments?error=No+fue+posible+registrar+la+investidura.";
  try {
    await recordInvestitureAction({ clubId: formData.get("clubId"), enrollmentId: formData.get("enrollmentId"), rationale: formData.get("rationale") });
    revalidatePath("/assessments");
    destination = "/assessments?message=Investidura+registrada.";
  } catch {
    // Server-side scope and readiness checks intentionally remain opaque.
  }
  redirect(destination);
}
