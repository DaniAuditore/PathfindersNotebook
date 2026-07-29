import "server-only";

import { calculateProgress, isReadyForAssessment, type ProgressRequirement, type ProgressRecord } from "@/modules/progress/domain/progress";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { canRecordInvestiture, type AssessmentRoleAssignment, type AssessmentWorkspaceItem } from "../application/assessment-read-model";

export class SupabaseAssessmentReader {
  async workspace(actorId: string): Promise<AssessmentWorkspaceItem[] | null> {
    const supabase = await createSupabaseServerClient();
    const { data: assignments, error: assignmentError } = await supabase.from("role_assignments").select("club_id, role").eq("user_id", actorId).is("revoked_at", null).in("role", ["CLUB_DIRECTOR", "INSTRUCTOR"]);
    if (assignmentError) throw new Error("No fue posible cargar el alcance de evaluaciones.");
    const clubIds = (assignments ?? []).flatMap((assignment) => assignment.club_id ? [assignment.club_id] : []);
    const roleAssignments: AssessmentRoleAssignment[] = (assignments ?? []).flatMap((assignment) => assignment.club_id && (assignment.role === "CLUB_DIRECTOR" || assignment.role === "INSTRUCTOR") ? [{ clubId: assignment.club_id, role: assignment.role }] : []);
    if (clubIds.length === 0) return null;
    const { data: enrollments, error: enrollmentError } = await supabase.from("enrollments").select("id, club_id, student_id, catalog_id, catalog_version_id, school_year").in("club_id", clubIds).in("status", ["active", "completed"]).order("school_year", { ascending: false });
    if (enrollmentError) throw new Error("No fue posible cargar las inscripciones.");
    if (!enrollments?.length) return [];
    const enrollmentIds = enrollments.map((row) => row.id);
    const [{ data: students, error: studentError }, { data: catalogs, error: catalogError }, { data: requirements, error: requirementError }, { data: progress, error: progressError }, { data: assessments, error: assessmentError }, { data: investitures, error: investitureError }] = await Promise.all([
      supabase.from("students").select("id, display_name").in("id", enrollments.map((row) => row.student_id)),
      supabase.from("catalogs").select("id, title").in("id", enrollments.map((row) => row.catalog_id)),
      supabase.from("requirements").select("id, catalog_version_id, parent_requirement_id, optional, weight, completion_rule, minimum_children, allow_reuse, progress_mode, completion_semantics, completion_threshold").in("catalog_version_id", enrollments.map((row) => row.catalog_version_id)),
      supabase.from("requirement_progress").select("enrollment_id, requirement_id, status, accepted_credit_key").in("enrollment_id", enrollmentIds),
      supabase.from("assessments").select("enrollment_id, decision, created_at").in("enrollment_id", enrollmentIds),
      supabase.from("investitures").select("enrollment_id, invested_at").in("enrollment_id", enrollmentIds),
    ]);
    if (studentError || catalogError || requirementError || progressError || assessmentError || investitureError) throw new Error("No fue posible cargar el estado de evaluación.");
    const names = new Map((students ?? []).map((row) => [row.id, row.display_name]));
    const titles = new Map((catalogs ?? []).map((row) => [row.id, row.title]));
    const requirementsByVersion = new Map<string, ProgressRequirement[]>();
    (requirements ?? []).forEach((row) => requirementsByVersion.set(row.catalog_version_id, [...(requirementsByVersion.get(row.catalog_version_id) ?? []), { id: row.id, parentRequirementId: row.parent_requirement_id, optional: row.optional, weight: Number(row.weight), completionRule: row.completion_rule, minimumChildren: row.minimum_children, allowReuse: row.allow_reuse, progressMode: row.progress_mode, completionSemantics: row.completion_semantics, completionThreshold: row.completion_threshold }]));
    const progressByEnrollment = new Map<string, ProgressRecord[]>();
    (progress ?? []).forEach((row) => progressByEnrollment.set(row.enrollment_id, [...(progressByEnrollment.get(row.enrollment_id) ?? []), { requirementId: row.requirement_id, status: row.status, acceptedCreditKey: row.accepted_credit_key }]));
    const assessmentByEnrollment = new Map((assessments ?? []).map((row) => [row.enrollment_id, row]));
    const investitureByEnrollment = new Map((investitures ?? []).map((row) => [row.enrollment_id, row]));
    return enrollments.map((enrollment) => {
      const requirementsForEnrollment = requirementsByVersion.get(enrollment.catalog_version_id) ?? [];
      const progressForEnrollment = progressByEnrollment.get(enrollment.id) ?? [];
      const assessment = assessmentByEnrollment.get(enrollment.id);
      const investiture = investitureByEnrollment.get(enrollment.id);
      return { enrollmentId: enrollment.id, clubId: enrollment.club_id, studentName: names.get(enrollment.student_id) ?? "Alumno", catalogTitle: titles.get(enrollment.catalog_id) ?? "Clase", schoolYear: enrollment.school_year, approvedPercentage: calculateProgress(requirementsForEnrollment, progressForEnrollment), ready: isReadyForAssessment(requirementsForEnrollment, progressForEnrollment), assessmentDecision: assessment?.decision ?? null, assessedAt: assessment?.created_at ?? null, investedAt: investiture?.invested_at ?? null, canRecordInvestiture: canRecordInvestiture(roleAssignments, enrollment.club_id) };
    });
  }
}
