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
  const { data: progress, error: progressError } = await supabase.from("requirement_progress").select("enrollment_id").eq("id", command.progressId).single();
  if (progressError || !progress) throw new Error("Progress was not found in an accessible enrollment.");
  const { data: enrollment, error: enrollmentError } = await supabase.from("enrollments").select("student_id").eq("id", progress.enrollment_id).single();
  if (enrollmentError || !enrollment) throw new Error("Progress was not found in an accessible enrollment.");
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
  const actor = await requireRole(enrollment.club_id, ["admin", "instructor"]);
  const result = await new SupabaseReviewFacade().review({ ...command, actorId: actor.id });
  revalidatePath("/dashboard");
  revalidatePath("/reviews");
  revalidatePath(`/students/${enrollment.student_id}`);
  return result;
}

function messageFor(error: unknown) {
  return error instanceof z.ZodError ? error.issues[0]?.message ?? "The form is invalid." : "The action could not be completed.";
}

export async function submitProgressFormAction(formData: FormData) {
  let destination = "/dashboard?error=The+action+could+not+be+completed.";
  const studentId = z.uuid().safeParse(formData.get("studentId"));
  try {
    await submitProgressAction({ progressId: formData.get("progressId"), submissionText: formData.get("submissionText") });
    destination = studentId.success ? `/students/${studentId.data}?message=Progress+submitted.` : "/dashboard?message=Progress+submitted.";
  } catch (error) {
    const message = encodeURIComponent(messageFor(error));
    destination = studentId.success ? `/students/${studentId.data}?error=${message}` : `/dashboard?error=${message}`;
  }
  redirect(destination);
}

export async function reviewProgressFormAction(formData: FormData) {
  let destination = "/reviews?error=The+action+could+not+be+completed.";
  try {
    await reviewProgressAction({ progressId: formData.get("progressId"), attemptId: formData.get("attemptId"), decision: formData.get("decision"), reason: formData.get("reason") || undefined });
    destination = "/reviews?message=Review+saved.";
  } catch (error) {
    destination = `/reviews?error=${encodeURIComponent(messageFor(error))}`;
  }
  redirect(destination);
}

export async function reverseProgressAction(input: unknown) {
  const command = reversalSchema.parse(input);
  const actor = await requireRole(command.clubId, ["admin", "instructor"]);
  return new SupabaseReviewFacade().reverse({ ...command, actorId: actor.id });
}

export async function manuallyCompleteProgressAction(input: unknown) {
  const command = manualSchema.parse(input);
  await requireRole(command.clubId, ["admin", "instructor"]);
  const supabase = await createSupabaseServerClient();
  const { data: enrollmentId, error } = await supabase.rpc("manually_complete_progress", { target_progress_id: command.progressId, rationale_input: command.rationale, credit_key_input: command.creditKey ?? null });
  if (error || !enrollmentId) throw new Error("Unable to manually complete this progress.");
  return { enrollmentId };
}
