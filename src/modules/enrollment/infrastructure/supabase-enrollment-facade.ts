import "server-only";

import type { EnrollStudentCommand, EnrollmentFacade } from "../application/enrollment-facade";
import type { Enrollment } from "../domain/enrollment";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export class SupabaseEnrollmentFacade implements EnrollmentFacade {
  async enroll(command: EnrollStudentCommand): Promise<Enrollment> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("enroll_student", {
      target_student_id: command.studentId,
      target_catalog_id: command.catalogId,
      target_catalog_version_id: command.catalogVersionId,
      target_school_year: command.schoolYear,
    });
    if (error) throw new Error("Unable to enroll the student in this class version.");
    if (!isEnrollmentResponse(data)) throw new Error("The enrollment command returned an invalid response.");
    return {
      id: data.id, clubId: data.clubId, studentId: data.studentId, catalogId: data.catalogId, catalogVersionId: data.catalogVersionId, schoolYear: data.schoolYear,
    };
  }

  async migrateVersion(input: { enrollmentId: string; catalogVersionId: string; actorId: string; rationale: string }): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("migrate_enrollment_version", {
      target_enrollment_id: input.enrollmentId,
      target_catalog_version_id: input.catalogVersionId,
    });
    if (error) throw new Error("Unable to migrate the enrollment to the requested version.");
  }
}

function isEnrollmentResponse(value: unknown): value is Enrollment {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return ["id", "clubId", "studentId", "catalogId", "catalogVersionId"].every((key) => typeof candidate[key] === "string") && typeof candidate.schoolYear === "number";
}
