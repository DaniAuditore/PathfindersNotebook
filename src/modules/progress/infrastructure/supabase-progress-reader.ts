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
import { readV2ContentScope } from "@/shared/auth/v2-content-scope";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type EnrollmentRow = { id: string; student_id: string; catalog_id: string; catalog_version_id: string; school_year: number };
type RequirementDbRow = { id: string; parent_requirement_id: string | null; optional: boolean; weight: number | string; completion_rule: "all" | "any" | "minimum_n" | null; minimum_children: number | null; allow_reuse: boolean; title: string; instructions: string; requirement_type: string; requires_evidence: boolean; section_id: string | null; source_code: string | null; modalities: string[] | null; progress_mode: "direct" | "derived" | null; completion_semantics: "direct" | "all_children" | "at_least_one" | "at_least_n" | null; completion_threshold: number | null; child_role: "step" | "option" | "checklist_item" | null; position: number };
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
    const scope = await readV2ContentScope(supabase, actorId);
    const { data: links, error: linkError } = await supabase.from("member_legacy_student_links").select("legacy_student_id");
    const linkRows = requireData(links, linkError, "Unable to load reconciled learners.") as { legacy_student_id: string }[];
    const studentIds = linkRows.map((link) => link.legacy_student_id);
    const learnerRows = studentIds.length === 0 ? [] : await this.reconciledLearners(studentIds, supabase);
    const learners = await Promise.all(learnerRows.map(async (student) => ({ studentId: student.id, displayName: student.display_name, enrollments: await this.activeEnrollmentsForStudent(student.id, supabase) })));
    return { learners, canReview: scope.canReview, cohort: await this.cohortSummary(supabase) };
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
    if (!(await readV2ContentScope(supabase, actorId)).canReview) return [];

    const { data: enrollments, error: enrollmentError } = await supabase.from("enrollments").select("id, student_id").eq("status", "active");
    const enrollmentRows = requireData(enrollments, enrollmentError, "Unable to load review enrollments.") as { id: string; student_id: string }[];
    if (enrollmentRows.length === 0) return [];
    const { data: progress, error: progressError } = await supabase.from("requirement_progress").select("id, enrollment_id, requirement_id").in("enrollment_id", ids(enrollmentRows)).eq("status", "submitted");
    const progressRows = requireData(progress, progressError, "Unable to load submitted progress.") as { id: string; enrollment_id: string; requirement_id: string }[];
    if (progressRows.length === 0) return [];

    const [{ data: attempts, error: attemptError }, { data: students, error: studentError }, { data: requirements, error: requirementError }] = await Promise.all([
      supabase.from("progress_attempts").select("id, progress_id, submission_text, submitted_at").in("progress_id", ids(progressRows)).is("decision", null).order("submitted_at", { ascending: true }),
      supabase.from("students").select("id, display_name").in("id", enrollmentRows.map((row) => row.student_id)),
      supabase.from("requirements").select("id, title, parent_requirement_id").in("id", progressRows.map((row) => row.requirement_id)),
    ]);
    const attemptRows = requireData(attempts, attemptError, "Unable to load pending attempts.") as { id: string; progress_id: string; submission_text: string | null; submitted_at: string }[];
    const studentNames = new Map((requireData(students, studentError, "Unable to load learner names.") as { id: string; display_name: string }[]).map((row) => [row.id, row.display_name]));
    const requirementRows = requireData(requirements, requirementError, "Unable to load requirement titles.") as { id: string; title: string; parent_requirement_id: string | null }[];
    const requirementTitles = new Map(requirementRows.map((row) => [row.id, row.title]));
    const parents = requirementRows.filter((row) => row.parent_requirement_id).map((row) => row.parent_requirement_id!);
    const { data: roots, error: rootError } = parents.length === 0
      ? { data: [], error: null }
      : await supabase.from("requirements").select("id, title").in("id", parents);
    const rootTitles = new Map((requireData(roots, rootError, "Unable to load root requirement titles.") as { id: string; title: string }[]).map((row) => [row.id, row.title]));
    const enrollmentById = new Map(enrollmentRows.map((row) => [row.id, row]));
    const progressById = new Map(progressRows.map((row) => [row.id, row]));
    return attemptRows.flatMap((attempt) => {
      const progressRow = progressById.get(attempt.progress_id);
      const enrollment = progressRow ? enrollmentById.get(progressRow.enrollment_id) : undefined;
      if (!progressRow || !enrollment) return [];
      const requirement = requirementRows.find((row) => row.id === progressRow.requirement_id);
      const rootRequirementTitle = requirement?.parent_requirement_id ? rootTitles.get(requirement.parent_requirement_id) ?? null : null;
      const queueAgeDays = Math.max(0, Math.floor((Date.now() - new Date(attempt.submitted_at).getTime()) / 86_400_000));
      return [{ progressId: progressRow.id, attemptId: attempt.id, studentName: studentNames.get(enrollment.student_id) ?? "Alumno", requirementTitle: requirementTitles.get(progressRow.requirement_id) ?? "Requisito", rootRequirementTitle, childContext: rootRequirementTitle ? `Parte de: ${rootRequirementTitle}` : null, submissionText: attempt.submission_text, submittedAt: attempt.submitted_at, queueAgeDays }];
    });
  }

  private async cohortSummary(supabase: SupabaseClient): Promise<DashboardReadModel["cohort"]> {
    const { data: enrollments, error: enrollmentError } = await supabase.from("enrollments").select("id").eq("status", "active");
    const enrollmentRows = requireData(enrollments, enrollmentError, "Unable to load scoped enrollment counts.") as { id: string }[];
    if (enrollmentRows.length === 0) return { enrolled: 0, submitted: 0, accepted: 0, rejected: 0, oldestPendingAt: null };
    const { data: progress, error: progressError } = await supabase.from("requirement_progress").select("id, status").in("enrollment_id", ids(enrollmentRows));
    const progressRows = requireData(progress, progressError, "Unable to load scoped progress counts.") as { id: string; status: ProgressStatus }[];
    const submittedIds = progressRows.filter((row) => row.status === "submitted").map((row) => row.id);
    let oldestPendingAt: string | null = null;
    if (submittedIds.length > 0) {
      const { data: pending, error: pendingError } = await supabase.from("progress_attempts").select("submitted_at").in("progress_id", submittedIds).is("decision", null).order("submitted_at", { ascending: true }).limit(1);
      const pendingRows = requireData(pending, pendingError, "Unable to load pending review age.") as { submitted_at: string }[];
      oldestPendingAt = pendingRows[0]?.submitted_at ?? null;
    }
    return { enrolled: enrollmentRows.length, submitted: submittedIds.length, accepted: progressRows.filter((row) => row.status === "accepted").length, rejected: progressRows.filter((row) => row.status === "rejected").length, oldestPendingAt };
  }

  private async reconciledLearners(studentIds: readonly string[], supabase: SupabaseClient): Promise<{ id: string; display_name: string }[]> {
    const { data, error } = await supabase.from("students").select("id, display_name").in("id", studentIds).order("display_name");
    return requireData(data, error, "Unable to load linked learners.") as { id: string; display_name: string }[];
  }

  private async activeEnrollmentsForStudent(studentId: string, supabase: SupabaseClient): Promise<EnrollmentProgressReadModel[]> {
    const { data, error } = await supabase.from("enrollments").select("id, student_id, catalog_id, catalog_version_id, school_year").eq("student_id", studentId).eq("status", "active").order("school_year", { ascending: false });
    const enrollments = requireData(data, error, "Unable to load active enrollments.") as EnrollmentRow[];
    return Promise.all(enrollments.map((enrollment) => this.enrollment(enrollment, supabase)));
  }

  private async enrollment(enrollment: EnrollmentRow, supabase: SupabaseClient): Promise<EnrollmentProgressReadModel> {
    const [{ data: catalog, error: catalogError }, { data: requirements, error: requirementError }, { data: progress, error: progressError }, { data: sections, error: sectionError }] = await Promise.all([
      supabase.from("catalogs").select("title").eq("id", enrollment.catalog_id).single(),
      supabase.from("requirements").select("id, parent_requirement_id, optional, weight, completion_rule, minimum_children, allow_reuse, title, instructions, requirement_type, requires_evidence, section_id, source_code, modalities, progress_mode, completion_semantics, completion_threshold, child_role, position").eq("catalog_version_id", enrollment.catalog_version_id).order("position"),
      supabase.from("requirement_progress").select("id, enrollment_id, requirement_id, status, accepted_credit_key").eq("enrollment_id", enrollment.id),
      supabase.from("catalog_sections").select("id, title, position").eq("catalog_version_id", enrollment.catalog_version_id).order("position"),
    ]);
    const requirementRows = requireData(requirements, requirementError, "Unable to load enrollment requirements.") as RequirementDbRow[];
    const progressRows = requireData(progress, progressError, "Unable to load enrollment progress.") as ProgressDbRow[];
    let attempts: AttemptDbRow[] = [];
    if (progressRows.length > 0) {
      const result = await supabase.from("progress_attempts").select("id, progress_id, attempt_number, submission_text, submitted_at, decision, decision_reason").in("progress_id", ids(progressRows)).order("attempt_number", { ascending: false });
      attempts = requireData(result.data, result.error, "Unable to load progress history.") as AttemptDbRow[];
    }
    const mappedRequirements: ProgressRequirementRow[] = requirementRows.map((row) => ({ id: row.id, parentRequirementId: row.parent_requirement_id, optional: row.optional, weight: Number(row.weight), completionRule: row.completion_rule, minimumChildren: row.minimum_children, allowReuse: row.allow_reuse, sectionId: row.section_id, sourceCode: row.source_code, modalities: row.modalities as ProgressRequirementRow["modalities"], progressMode: row.progress_mode, completionSemantics: row.completion_semantics, completionThreshold: row.completion_threshold, childRole: row.child_role, position: row.position, title: row.title, instructions: row.instructions, requirementType: row.requirement_type, requiresEvidence: row.requires_evidence }));
    const mappedProgress: ProgressRow[] = progressRows.map((row) => ({ progressId: row.id, requirementId: row.requirement_id, status: row.status, acceptedCreditKey: row.accepted_credit_key }));
    return buildEnrollmentProgressReadModel({ enrollmentId: enrollment.id, catalogTitle: (requireData(catalog, catalogError, "Unable to load the enrolled catalog.") as { title: string }).title, schoolYear: enrollment.school_year, requirements: mappedRequirements, progress: mappedProgress, attempts: groupAttempts(attempts), sections: requireData(sections, sectionError, "Unable to load catalog sections.") as { id: string; title: string; position: number }[] });
  }
}
