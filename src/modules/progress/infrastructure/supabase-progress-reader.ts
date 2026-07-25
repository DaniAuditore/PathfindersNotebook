import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEnrollmentProgressReadModel,
  type DashboardReadModel,
  type EnrollmentProgressReadModel,
  type LearnerSummary,
  type ProgressRequirementRow,
  type ProgressRow,
  type RequirementHistoryItem,
  type ReviewQueueItem,
} from "../application/progress-read-model";
import type { ProgressStatus } from "../domain/progress";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type EnrollmentRow = { id: string; student_id: string; catalog_id: string; catalog_version_id: string; school_year: number };
type RequirementDbRow = { id: string; parent_requirement_id: string | null; optional: boolean; weight: number | string; completion_rule: "all" | "any" | "minimum_n" | null; minimum_children: number | null; allow_reuse: boolean; title: string; instructions: string; requirement_type: string; requires_evidence: boolean };
type ProgressDbRow = { id: string; enrollment_id: string; requirement_id: string; status: ProgressStatus; accepted_credit_key: string | null };
type AttemptDbRow = { id: string; progress_id: string; attempt_number: number; submission_text: string | null; submitted_at: string; decision: "accepted" | "rejected" | null; decision_reason: string | null };

function ids(rows: readonly { id: string }[]) { return rows.map((row) => row.id); }

function requireData<T>(data: T | null, error: { message: string } | null, message: string): T {
  if (error || data === null) throw new Error(message);
  return data;
}

function groupAttempts(rows: readonly AttemptDbRow[]) {
  const grouped = new Map<string, RequirementHistoryItem[]>();
  rows.forEach((row) => {
    const history = grouped.get(row.progress_id) ?? [];
    history.push({ attemptId: row.id, attemptNumber: row.attempt_number, submissionText: row.submission_text, submittedAt: row.submitted_at, decision: row.decision, decisionReason: row.decision_reason });
    grouped.set(row.progress_id, history);
  });
  return grouped;
}

export class SupabaseProgressReader {
  private async client(): Promise<SupabaseClient> { return createSupabaseServerClient(); }

  async dashboard(actorId: string): Promise<DashboardReadModel> {
    const supabase = await this.client();
    const [{ data: memberships, error: membershipError }, { data: students, error: studentError }] = await Promise.all([
      supabase.from("memberships").select("club_id, role").eq("user_id", actorId).in("role", ["admin", "instructor"]),
      supabase.from("students").select("id, display_name").or(`guardian_user_id.eq.${actorId},student_user_id.eq.${actorId}`).order("display_name"),
    ]);
    const scopedMemberships = requireData(memberships, membershipError, "Unable to load club roles.") as { club_id: string; role: string }[];
    const learnerRows = requireData(students, studentError, "Unable to load linked learners.") as { id: string; display_name: string }[];
    const learners = await Promise.all(learnerRows.map(async (student) => ({ studentId: student.id, displayName: student.display_name, enrollments: await this.activeEnrollmentsForStudent(student.id, supabase) })));
    return { learners, canReview: scopedMemberships.length > 0 };
  }

  async learner(studentId: string): Promise<LearnerSummary | null> {
    const supabase = await this.client();
    const { data, error } = await supabase.from("students").select("id, display_name").eq("id", studentId).maybeSingle();
    if (error) throw new Error("Unable to load the learner.");
    if (!data) return null;
    return { studentId: data.id, displayName: data.display_name, enrollments: await this.activeEnrollmentsForStudent(data.id, supabase) };
  }

  async reviewQueue(actorId: string): Promise<ReviewQueueItem[]> {
    const supabase = await this.client();
    const { data: memberships, error: membershipError } = await supabase.from("memberships").select("club_id").eq("user_id", actorId).in("role", ["admin", "instructor"]);
    const clubIds = (requireData(memberships, membershipError, "Unable to load reviewer clubs.") as { club_id: string }[]).map((row) => row.club_id);
    if (clubIds.length === 0) return [];

    const { data: enrollments, error: enrollmentError } = await supabase.from("enrollments").select("id, student_id").in("club_id", clubIds).eq("status", "active");
    const enrollmentRows = requireData(enrollments, enrollmentError, "Unable to load review enrollments.") as { id: string; student_id: string }[];
    if (enrollmentRows.length === 0) return [];
    const { data: progress, error: progressError } = await supabase.from("requirement_progress").select("id, enrollment_id, requirement_id").in("enrollment_id", ids(enrollmentRows)).eq("status", "submitted");
    const progressRows = requireData(progress, progressError, "Unable to load submitted progress.") as { id: string; enrollment_id: string; requirement_id: string }[];
    if (progressRows.length === 0) return [];

    const [{ data: attempts, error: attemptError }, { data: students, error: studentError }, { data: requirements, error: requirementError }] = await Promise.all([
      supabase.from("progress_attempts").select("id, progress_id, submission_text, submitted_at").in("progress_id", ids(progressRows)).is("decision", null).order("submitted_at", { ascending: true }),
      supabase.from("students").select("id, display_name").in("id", enrollmentRows.map((row) => row.student_id)),
      supabase.from("requirements").select("id, title").in("id", progressRows.map((row) => row.requirement_id)),
    ]);
    const attemptRows = requireData(attempts, attemptError, "Unable to load pending attempts.") as { id: string; progress_id: string; submission_text: string | null; submitted_at: string }[];
    const studentNames = new Map((requireData(students, studentError, "Unable to load learner names.") as { id: string; display_name: string }[]).map((row) => [row.id, row.display_name]));
    const requirementTitles = new Map((requireData(requirements, requirementError, "Unable to load requirement titles.") as { id: string; title: string }[]).map((row) => [row.id, row.title]));
    const enrollmentById = new Map(enrollmentRows.map((row) => [row.id, row]));
    const progressById = new Map(progressRows.map((row) => [row.id, row]));
    return attemptRows.flatMap((attempt) => {
      const progressRow = progressById.get(attempt.progress_id);
      const enrollment = progressRow ? enrollmentById.get(progressRow.enrollment_id) : undefined;
      if (!progressRow || !enrollment) return [];
      return [{ progressId: progressRow.id, attemptId: attempt.id, studentName: studentNames.get(enrollment.student_id) ?? "Learner", requirementTitle: requirementTitles.get(progressRow.requirement_id) ?? "Requirement", submissionText: attempt.submission_text, submittedAt: attempt.submitted_at }];
    });
  }

  private async activeEnrollmentsForStudent(studentId: string, supabase: SupabaseClient): Promise<EnrollmentProgressReadModel[]> {
    const { data, error } = await supabase.from("enrollments").select("id, student_id, catalog_id, catalog_version_id, school_year").eq("student_id", studentId).eq("status", "active").order("school_year", { ascending: false });
    const enrollments = requireData(data, error, "Unable to load active enrollments.") as EnrollmentRow[];
    return Promise.all(enrollments.map((enrollment) => this.enrollment(enrollment, supabase)));
  }

  private async enrollment(enrollment: EnrollmentRow, supabase: SupabaseClient): Promise<EnrollmentProgressReadModel> {
    const [{ data: catalog, error: catalogError }, { data: requirements, error: requirementError }, { data: progress, error: progressError }] = await Promise.all([
      supabase.from("catalogs").select("title").eq("id", enrollment.catalog_id).single(),
      supabase.from("requirements").select("id, parent_requirement_id, optional, weight, completion_rule, minimum_children, allow_reuse, title, instructions, requirement_type, requires_evidence").eq("catalog_version_id", enrollment.catalog_version_id).order("position"),
      supabase.from("requirement_progress").select("id, enrollment_id, requirement_id, status, accepted_credit_key").eq("enrollment_id", enrollment.id),
    ]);
    const requirementRows = requireData(requirements, requirementError, "Unable to load enrollment requirements.") as RequirementDbRow[];
    const progressRows = requireData(progress, progressError, "Unable to load enrollment progress.") as ProgressDbRow[];
    let attempts: AttemptDbRow[] = [];
    if (progressRows.length > 0) {
      const result = await supabase.from("progress_attempts").select("id, progress_id, attempt_number, submission_text, submitted_at, decision, decision_reason").in("progress_id", ids(progressRows)).order("attempt_number", { ascending: false });
      attempts = requireData(result.data, result.error, "Unable to load progress history.") as AttemptDbRow[];
    }
    const mappedRequirements: ProgressRequirementRow[] = requirementRows.map((row) => ({ id: row.id, parentRequirementId: row.parent_requirement_id, optional: row.optional, weight: Number(row.weight), completionRule: row.completion_rule, minimumChildren: row.minimum_children, allowReuse: row.allow_reuse, title: row.title, instructions: row.instructions, requirementType: row.requirement_type, requiresEvidence: row.requires_evidence }));
    const mappedProgress: ProgressRow[] = progressRows.map((row) => ({ progressId: row.id, requirementId: row.requirement_id, status: row.status, acceptedCreditKey: row.accepted_credit_key }));
    return buildEnrollmentProgressReadModel({ enrollmentId: enrollment.id, catalogTitle: (requireData(catalog, catalogError, "Unable to load the enrolled catalog.") as { title: string }).title, schoolYear: enrollment.school_year, requirements: mappedRequirements, progress: mappedProgress, attempts: groupAttempts(attempts) });
  }
}
