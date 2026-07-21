import "server-only";

import type { ReviewFacade, ReviewProgressCommand, SubmitProgressCommand } from "../application/review-facade";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export class SupabaseReviewFacade implements ReviewFacade {
  async submit(command: SubmitProgressCommand): Promise<{ attemptId: string; enrollmentId: string }> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("submit_progress_attempt", { target_progress_id: command.progressId, submission_text_input: command.submissionText ?? null, credit_key_input: command.creditKey ?? null, evidence_ids_input: command.evidenceIds ?? [] });
    if (error || !data) throw new Error("Unable to submit this progress attempt.");
    const { data: progress, error: progressError } = await supabase.from("requirement_progress").select("enrollment_id").eq("id", command.progressId).single();
    if (progressError) throw new Error("Unable to resolve the submitted progress.");
    return { attemptId: data, enrollmentId: progress.enrollment_id };
  }

  async review(command: ReviewProgressCommand): Promise<{ enrollmentId: string }> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("review_progress_attempt", { target_progress_id: command.progressId, target_attempt_id: command.attemptId, decision_input: command.decision, reason_input: command.reason ?? null });
    if (error || !data) throw new Error("Unable to review this progress attempt.");
    return { enrollmentId: data };
  }

  async reverse(input: { clubId: string; progressId: string; attemptId: string; actorId: string; rationale: string }): Promise<{ enrollmentId: string }> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("reverse_progress_acceptance", { target_progress_id: input.progressId, target_attempt_id: input.attemptId, rationale_input: input.rationale });
    if (error || !data) throw new Error("Unable to reverse this accepted progress.");
    return { enrollmentId: data };
  }
}
