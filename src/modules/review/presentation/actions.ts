"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { progressReviewSchema, textSubmissionSchema } from "../application/progress-commands";
import { SupabaseReviewFacade } from "../infrastructure/supabase-review-facade";
import { requireRole, requireSession } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const submissionSchema = textSubmissionSchema;
const reviewSchema = progressReviewSchema;
const reversalSchema = z.object({ clubId: z.uuid(), progressId: z.uuid(), attemptId: z.uuid(), rationale: z.string().trim().min(1).max(2_000) });
const manualSchema = z.object({ clubId: z.uuid(), progressId: z.uuid(), rationale: z.string().trim().min(1).max(2_000), creditKey: z.string().trim().min(1).max(160).optional() });

export async function submitProgressAction(input: unknown) {
  const command = submissionSchema.parse(input);
  const actor = await requireSession();
  const supabase = await createSupabaseServerClient();
  const { data: progress, error: progressError } = await supabase.from("requirement_progress").select("enrollment_id, requirement_id").eq("id", command.progressId).single();
  if (progressError || !progress) throw new Error("Progress was not found in an accessible enrollment.");
  const { data: enrollment, error: enrollmentError } = await supabase.from("enrollments").select("student_id").eq("id", progress.enrollment_id).single();
  if (enrollmentError || !enrollment) throw new Error("Progress was not found in an accessible enrollment.");
  const { data: requirement, error: requirementError } = await supabase.from("requirements").select("parent_requirement_id, progress_mode, completion_semantics, modalities, requires_evidence").eq("id", progress.requirement_id).single();
  if (requirementError || !requirement) throw new Error("Requirement submission rules could not be loaded.");
  if (requirement.progress_mode === "derived" || requirement.completion_semantics === "all_children" || requirement.completion_semantics === "at_least_one" || requirement.completion_semantics === "at_least_n" || requirement.requires_evidence || requirement.modalities?.includes("practical_in_person")) {
    throw new Error("This requirement cannot be submitted as text.");
  }
  const result = await new SupabaseReviewFacade().submit({ ...command, actorId: actor.id, evidenceIds: [] });
  revalidatePath("/dashboard");
  revalidatePath(`/students/${enrollment.student_id}`);
  return result;
}

export async function reviewProgressAction(input: unknown) {
  const command = reviewSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { data: progress, error: progressError } = await supabase.from("requirement_progress").select("enrollment_id").eq("id", command.progressId).single();
  if (progressError || !progress) throw new Error("Progress was not found in an accessible club.");
  const { data: enrollment, error: enrollmentError } = await supabase.from("enrollments").select("club_id, student_id").eq("id", progress.enrollment_id).single();
  if (enrollmentError || !enrollment) throw new Error("Progress was not found in an accessible club.");
  const actor = await requireRole(enrollment.club_id, ["CLUB_DIRECTOR", "INSTRUCTOR"]);
  const result = await new SupabaseReviewFacade().review({ ...command, actorId: actor.id });
  revalidatePath("/dashboard");
  revalidatePath("/reviews");
  revalidatePath(`/students/${enrollment.student_id}`);
  return result;
}

function messageFor(error: unknown) {
  return error instanceof z.ZodError ? "El formulario no es válido." : "No fue posible completar la acción.";
}

export async function submitProgressFormAction(formData: FormData) {
  let destination = "/dashboard?error=No+fue+posible+completar+la+acción.";
  const studentId = z.uuid().safeParse(formData.get("studentId"));
  try {
    await submitProgressAction({ progressId: formData.get("progressId"), submissionText: formData.get("submissionText") });
    destination = studentId.success ? `/students/${studentId.data}?message=Entrega+enviada+para+revisión.` : "/dashboard?message=Entrega+enviada+para+revisión.";
  } catch (error) {
    const message = encodeURIComponent(messageFor(error));
    destination = studentId.success ? `/students/${studentId.data}?error=${message}` : `/dashboard?error=${message}`;
  }
  redirect(destination);
}

export async function reviewProgressFormAction(formData: FormData) {
  let destination = "/reviews?error=No+fue+posible+completar+la+acción.";
  try {
    await reviewProgressAction({ progressId: formData.get("progressId"), attemptId: formData.get("attemptId"), decision: formData.get("decision"), reason: formData.get("reason") || undefined });
    destination = "/reviews?message=Revisión+guardada.";
  } catch (error) {
    destination = `/reviews?error=${encodeURIComponent(messageFor(error))}`;
  }
  redirect(destination);
}

export async function reverseProgressAction(input: unknown) {
  const command = reversalSchema.parse(input);
  const actor = await requireRole(command.clubId, ["CLUB_DIRECTOR", "INSTRUCTOR"]);
  return new SupabaseReviewFacade().reverse({ ...command, actorId: actor.id });
}

export async function manuallyCompleteProgressAction(input: unknown) {
  const command = manualSchema.parse(input);
  await requireRole(command.clubId, ["CLUB_DIRECTOR", "INSTRUCTOR"]);
  const supabase = await createSupabaseServerClient();
  const { data: enrollmentId, error } = await supabase.rpc("manually_complete_progress", { target_progress_id: command.progressId, rationale_input: command.rationale, credit_key_input: command.creditKey ?? null });
  if (error || !enrollmentId) throw new Error("Unable to manually complete this progress.");
  return { enrollmentId };
}
