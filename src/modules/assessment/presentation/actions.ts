"use server";

import { z } from "zod";

import { requireRole } from "@/shared/auth/session";
import { writeActionLog } from "@/shared/observability/action-log";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const assessmentSchema = z.object({ clubId: z.uuid(), enrollmentId: z.uuid(), decision: z.enum(["passed", "failed"]), comments: z.string().max(4_000).default("") });
const investitureSchema = z.object({ clubId: z.uuid(), enrollmentId: z.uuid(), rationale: z.string().trim().min(1).max(2_000) });

export async function recordAssessmentAction(input: unknown) {
  const command = assessmentSchema.parse(input);
  const actor = await requireRole(command.clubId, ["admin", "instructor"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_assessment", { target_enrollment_id: command.enrollmentId, decision_input: command.decision, comments_input: command.comments });
  if (error) throw new Error("Unable to record this assessment.");
  await writeActionLog({ clubId: command.clubId, actorId: actor.id, action: `assessment.${command.decision}`, entityType: "assessment", entityId: command.enrollmentId, metadata: { commentsProvided: Boolean(command.comments) } });
}

export async function recordInvestitureAction(input: unknown) {
  const command = investitureSchema.parse(input);
  const actor = await requireRole(command.clubId, ["admin"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_investiture", { target_enrollment_id: command.enrollmentId, rationale_input: command.rationale });
  if (error) throw new Error("Investiture requires complete progress and a passing assessment.");
  await writeActionLog({ clubId: command.clubId, actorId: actor.id, action: "investiture.recorded", entityType: "investiture", entityId: command.enrollmentId, metadata: { rationaleProvided: true } });
}
