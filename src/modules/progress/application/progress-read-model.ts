import { calculateProgress, type ProgressRecord, type ProgressRequirement, type ProgressStatus } from "../domain/progress";

export interface RequirementHistoryItem {
  attemptId: string;
  attemptNumber: number;
  submissionText: string | null;
  submittedAt: string;
  decision: "accepted" | "rejected" | null;
  decisionReason: string | null;
}

export interface RequirementProgressItem {
  progressId: string;
  requirementId: string;
  title: string;
  instructions: string;
  requirementType: string;
  requiresEvidence: boolean;
  status: ProgressStatus;
  reviewReason: string | null;
  history: RequirementHistoryItem[];
}

export interface EnrollmentProgressReadModel {
  enrollmentId: string;
  catalogTitle: string;
  schoolYear: number;
  approvedPercentage: number;
  requirements: RequirementProgressItem[];
}

export interface LearnerSummary {
  studentId: string;
  displayName: string;
  enrollments: EnrollmentProgressReadModel[];
}

export interface DashboardReadModel {
  learners: LearnerSummary[];
  canReview: boolean;
}

export interface ReviewQueueItem {
  progressId: string;
  attemptId: string;
  studentName: string;
  requirementTitle: string;
  submissionText: string | null;
  submittedAt: string;
}

export interface ProgressRequirementRow extends ProgressRequirement {
  title: string;
  instructions: string;
  requirementType: string;
  requiresEvidence: boolean;
}

export interface ProgressRow extends ProgressRecord {
  progressId: string;
}

export function buildEnrollmentProgressReadModel(input: {
  enrollmentId: string;
  catalogTitle: string;
  schoolYear: number;
  requirements: readonly ProgressRequirementRow[];
  progress: readonly ProgressRow[];
  attempts: ReadonlyMap<string, readonly RequirementHistoryItem[]>;
}): EnrollmentProgressReadModel {
  return {
    enrollmentId: input.enrollmentId,
    catalogTitle: input.catalogTitle,
    schoolYear: input.schoolYear,
    approvedPercentage: calculateProgress(input.requirements, input.progress),
    requirements: input.requirements.map((requirement) => {
      const progress = input.progress.find((item) => item.requirementId === requirement.id);
      const history = [...(progress ? input.attempts.get(progress.progressId) ?? [] : [])];
      return {
        progressId: progress?.progressId ?? "",
        requirementId: requirement.id,
        title: requirement.title,
        instructions: requirement.instructions,
        requirementType: requirement.requirementType,
        requiresEvidence: requirement.requiresEvidence,
        status: progress?.status ?? "draft",
        reviewReason: history.find((attempt) => attempt.decision === "rejected")?.decisionReason ?? null,
        history,
      };
    }),
  };
}
