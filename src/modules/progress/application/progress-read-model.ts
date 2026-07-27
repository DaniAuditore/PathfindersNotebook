import { calculateProgress, calculateSectionProgress, isRequirementComplete, type ProgressRecord, type ProgressRequirement, type ProgressStatus, type RequirementModality } from "../domain/progress";

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
  sourceCode: string | null;
  modalities: readonly RequirementModality[];
  completionSemantics: "direct" | "all_children" | "at_least_one" | "at_least_n" | null;
  childRole: "step" | "option" | "checklist_item" | null;
  complete: boolean;
  canSubmitText: boolean;
  children: RequirementProgressItem[];
}

export interface SectionProgressReadModel {
  sectionId: string;
  title: string;
  position: number;
  approvedPercentage: number;
  requirements: RequirementProgressItem[];
}

export interface EnrollmentProgressReadModel {
  enrollmentId: string;
  catalogTitle: string;
  schoolYear: number;
  approvedPercentage: number;
  requirements: RequirementProgressItem[];
  sections: SectionProgressReadModel[];
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
  rootRequirementTitle: string | null;
  childContext: string | null;
  submissionText: string | null;
  submittedAt: string;
}

export interface ProgressRequirementRow extends ProgressRequirement {
  title: string;
  instructions: string;
  requirementType: string;
  requiresEvidence: boolean;
  position?: number;
  childRole?: "step" | "option" | "checklist_item" | null;
}

export interface ProgressRow extends ProgressRecord {
  progressId: string;
}

export function buildEnrollmentProgressReadModel(input: {
  enrollmentId: string;
  catalogTitle: string;
  schoolYear: number;
  sections?: readonly { id: string; title: string; position: number }[];
  requirements: readonly ProgressRequirementRow[];
  progress: readonly ProgressRow[];
  attempts: ReadonlyMap<string, readonly RequirementHistoryItem[]>;
}): EnrollmentProgressReadModel {
  const toItem = (requirement: ProgressRequirementRow): RequirementProgressItem => {
    const progress = input.progress.find((item) => item.requirementId === requirement.id);
    const history = [...(progress ? input.attempts.get(progress.progressId) ?? [] : [])];
    const modalities = requirement.modalities ?? [];
    const isRoot = !requirement.parentRequirementId;
    const isDirect = requirement.progressMode !== "derived" && requirement.completionSemantics !== "all_children" && requirement.completionSemantics !== "at_least_one" && requirement.completionSemantics !== "at_least_n";
    const textBlocked = requirement.requiresEvidence || modalities.includes("practical_in_person");
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
      sourceCode: requirement.sourceCode ?? null,
      modalities,
      completionSemantics: requirement.completionSemantics ?? null,
      childRole: requirement.childRole ?? null,
      complete: isRequirementComplete(requirement.id, input.requirements, input.progress),
      canSubmitText: isRoot && isDirect && !textBlocked && Boolean(progress?.progressId) && (progress?.status === "draft" || progress?.status === "rejected"),
      children: [],
    };
  };
  const items = new Map(input.requirements.map((requirement) => [requirement.id, toItem(requirement)]));
  const roots: RequirementProgressItem[] = [];
  input.requirements.forEach((requirement) => {
    const item = items.get(requirement.id)!;
    const parent = requirement.parentRequirementId ? items.get(requirement.parentRequirementId) : undefined;
    if (parent) parent.children.push(item);
    else roots.push(item);
  });
  const orderedRoots = roots.sort((a, b) => (input.requirements.find((item) => item.id === a.requirementId)?.position ?? 0) - (input.requirements.find((item) => item.id === b.requirementId)?.position ?? 0));
  const sectionRows = input.sections?.length ? input.sections : [{ id: "legacy-requirements", title: "Requirements", position: 0 }];
  const sections = sectionRows.slice().sort((a, b) => a.position - b.position).map((section) => ({
    sectionId: section.id,
    title: section.title,
    position: section.position,
    approvedPercentage: section.id === "legacy-requirements" ? calculateProgress(input.requirements, input.progress) : calculateSectionProgress(section.id, input.requirements, input.progress),
    requirements: section.id === "legacy-requirements" ? orderedRoots : orderedRoots.filter((requirement) => input.requirements.find((item) => item.id === requirement.requirementId)?.sectionId === section.id),
  }));
  return {
    enrollmentId: input.enrollmentId,
    catalogTitle: input.catalogTitle,
    schoolYear: input.schoolYear,
    approvedPercentage: calculateProgress(input.requirements, input.progress),
    requirements: [...items.values()],
    sections,
  };
}
