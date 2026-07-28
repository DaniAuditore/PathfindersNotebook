"use server";

import { z } from "zod";

import { SupabaseEnrollmentFacade } from "../infrastructure/supabase-enrollment-facade";
import { requireClubResourceScope, requireRole } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const enrollmentSchema = z.object({
  clubId: z.uuid(), studentId: z.uuid(), catalogId: z.uuid(), catalogVersionId: z.uuid(), schoolYear: z.int().min(2000).max(2100),
});
const migrationSchema = z.object({ enrollmentId: z.uuid(), catalogVersionId: z.uuid(), rationale: z.string().trim().min(1).max(1_000) });

export async function enrollStudentAction(input: unknown) {
  const command = enrollmentSchema.parse(input);
  const actor = await requireRole(command.clubId, ["CLUB_DIRECTOR", "INSTRUCTOR"]);
  const enrollment = await new SupabaseEnrollmentFacade().enroll({ ...command, actorId: actor.id });
  return enrollment;
}

export async function migrateEnrollmentVersionAction(input: unknown) {
  const command = migrationSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { data: enrollment, error } = await supabase.from("enrollments").select("club_id").eq("id", command.enrollmentId).single();
  if (error || !enrollment) throw new Error("Enrollment not found.");
  const actor = await requireClubResourceScope(enrollment.club_id, ["CLUB_DIRECTOR"], async (clubId) => {
    const { data } = await supabase.from("enrollments").select("id").eq("id", command.enrollmentId).eq("club_id", clubId).maybeSingle();
    return Boolean(data);
  });
  await new SupabaseEnrollmentFacade().migrateVersion({ ...command, actorId: actor.id });
}
