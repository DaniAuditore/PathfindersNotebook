import type { Enrollment } from "../domain/enrollment";

export interface EnrollStudentCommand {
  clubId: string;
  studentId: string;
  catalogId: string;
  catalogVersionId: string;
  schoolYear: number;
  actorId: string;
}

export interface EnrollmentFacade {
  enroll(command: EnrollStudentCommand): Promise<Enrollment>;
  migrateVersion(input: { enrollmentId: string; catalogVersionId: string; actorId: string; rationale: string }): Promise<void>;
}
