export interface AssessmentWorkspaceItem {
  enrollmentId: string;
  clubId: string;
  studentName: string;
  catalogTitle: string;
  schoolYear: number;
  approvedPercentage: number;
  ready: boolean;
  assessmentDecision: "passed" | "failed" | null;
  assessedAt: string | null;
  investedAt: string | null;
  canRecordInvestiture: boolean;
}

export interface AssessmentRoleAssignment {
  clubId: string;
  role: "CLUB_DIRECTOR" | "INSTRUCTOR";
}

export function canRecordInvestiture(assignments: readonly AssessmentRoleAssignment[], clubId: string): boolean {
  return assignments.some((assignment) => assignment.clubId === clubId && assignment.role === "CLUB_DIRECTOR");
}
