import "server-only";

import type { EnrollStudentCommand, EnrollmentFacade } from "../application/enrollment-facade";
import type { Enrollment } from "../domain/enrollment";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export class SupabaseEnrollmentFacade implements EnrollmentFacade {
  async enroll(command: EnrollStudentCommand): Promise<Enrollment> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("enrollments")
      .insert({
        club_id: command.clubId,
        student_id: command.studentId,
        catalog_id: command.catalogId,
        catalog_version_id: command.catalogVersionId,
        school_year: command.schoolYear,
        enrolled_by: command.actorId,
      })
      .select("id, club_id, student_id, catalog_id, catalog_version_id, school_year")
      .single();
    if (error) throw new Error("Unable to enroll the student in this class version.");

    return {
      id: data.id,
      clubId: data.club_id,
      studentId: data.student_id,
      catalogId: data.catalog_id,
      catalogVersionId: data.catalog_version_id,
      schoolYear: data.school_year,
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
