"use server";

import { z } from "zod";

import { SupabaseReviewFacade } from "../infrastructure/supabase-review-facade";
import { requireRole, requireSession } from "@/shared/auth/session";
import { writeActionLog } from "@/shared/observability/action-log";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const submissionSchema = z.object({ progressId: z.uuid(), submissionText: z.string().max(10_000).optional(), creditKey: z.string().trim().min(1).max(160).optional(), evidenceIds: z.array(z.uuid()).max(10).optional() });
const reviewSchema = z.object({ clubId: z.uuid(), progressId: z.uuid(), attemptId: z.uuid(), decision: z.enum(["accepted", "rejected"]), reason: z.string().trim().max(2_000).optional() });
const reversalSchema = z.object({ clubId: z.uuid(), progressId: z.uuid(), attemptId: z.uuid(), rationale: z.string().trim().min(1).max(2_000) });
const manualSchema = z.object({ clubId: z.uuid(), progressId: z.uuid(), rationale: z.string().trim().min(1).max(2_000), creditKey: z.string().trim().min(1).max(160).optional() });

export async function submitProgressAction(input: unknown) {
  const command = submissionSchema.parse(input);
  const actor = await requireSession();
  const result = await new SupabaseReviewFacade().submit({ ...command, actorId: actor.id });
  const supabase = await createSupabaseServerClient();
  const { data: enrollment } = await supabase.from("enrollments").select("club_id").eq("id", result.enrollmentId).single();
  if (!enrollment) throw new Error("Enrollment not found.");
  await writeActionLog({ clubId: enrollment.club_id, actorId: actor.id, action: "progress.submitted", entityType: "progress_attempt", entityId: result.attemptId, metadata: { progressId: command.progressId } });
  return result;
}

export async function reviewProgressAction(input: unknown) {
  const command = reviewSchema.parse(input);
  const actor = await requireRole(command.clubId, ["admin", "instructor"]);
  const result = await new SupabaseReviewFacade().review({ ...command, actorId: actor.id });
  await writeActionLog({ clubId: command.clubId, actorId: actor.id, action: `progress.${command.decision}`, entityType: "requirement_progress", entityId: command.progressId, metadata: { attemptId: command.attemptId, reasonProvided: Boolean(command.reason) } });
  return result;
}

export async function reverseProgressAction(input: unknown) {
  const command = reversalSchema.parse(input);
  const actor = await requireRole(command.clubId, ["admin", "instructor"]);
  const result = await new SupabaseReviewFacade().reverse({ ...command, actorId: actor.id });
  await writeActionLog({ clubId: command.clubId, actorId: actor.id, action: "progress.reversed", entityType: "requirement_progress", entityId: command.progressId, metadata: { attemptId: command.attemptId, rationaleProvided: true } });
  return result;
}

export async function manuallyCompleteProgressAction(input: unknown) {
  const command = manualSchema.parse(input);
  const actor = await requireRole(command.clubId, ["admin", "instructor"]);
  const supabase = await createSupabaseServerClient();
  const { data: enrollmentId, error } = await supabase.rpc("manually_complete_progress", { target_progress_id: command.progressId, rationale_input: command.rationale, credit_key_input: command.creditKey ?? null });
  if (error || !enrollmentId) throw new Error("Unable to manually complete this progress.");
  await writeActionLog({ clubId: command.clubId, actorId: actor.id, action: "progress.manually_completed", entityType: "requirement_progress", entityId: command.progressId, metadata: { rationaleProvided: true } });
  return { enrollmentId };
}
