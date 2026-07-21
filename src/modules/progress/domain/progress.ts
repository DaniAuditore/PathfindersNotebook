export type ProgressStatus = "draft" | "submitted" | "accepted" | "rejected";
export type CompletionRule = "all" | "any" | "minimum_n";

export interface ProgressRequirement {
  id: string;
  parentRequirementId?: string | null;
  optional: boolean;
  weight: number;
  completionRule?: CompletionRule | null;
  minimumChildren?: number | null;
  allowReuse: boolean;
}

export interface ProgressRecord {
  requirementId: string;
  status: ProgressStatus;
  acceptedCreditKey?: string | null;
}

export function canTransitionProgress(from: ProgressStatus, to: ProgressStatus): boolean {
  return (from === "draft" && to === "submitted") || (from === "submitted" && (to === "accepted" || to === "rejected")) || (from === "rejected" && to === "submitted");
}

export function canCreditRequirement(
  requirement: ProgressRequirement,
  creditKey: string | undefined,
  progress: readonly ProgressRecord[],
): boolean {
  if (!creditKey || requirement.allowReuse) return true;
  return !progress.some((item) => item.requirementId !== requirement.id && item.status === "accepted" && item.acceptedCreditKey === creditKey);
}

function isComplete(requirement: ProgressRequirement, requirements: readonly ProgressRequirement[], progress: ReadonlyMap<string, ProgressRecord>): boolean {
  const children = requirements.filter((item) => item.parentRequirementId === requirement.id);
  if (children.length === 0) return progress.get(requirement.id)?.status === "accepted";
  const completed = children.filter((child) => isComplete(child, requirements, progress)).length;
  if (requirement.completionRule === "any") return completed >= 1;
  if (requirement.completionRule === "minimum_n") return completed >= (requirement.minimumChildren ?? 0);
  return completed === children.length;
}

export function calculateProgress(requirements: readonly ProgressRequirement[], progress: readonly ProgressRecord[]): number {
  const byRequirement = new Map(progress.map((item) => [item.requirementId, item]));
  const roots = requirements.filter((item) => !item.parentRequirementId && !item.optional);
  const totalWeight = roots.reduce((total, item) => total + item.weight, 0);
  if (totalWeight === 0) return 0;
  const completeWeight = roots.filter((item) => isComplete(item, requirements, byRequirement)).reduce((total, item) => total + item.weight, 0);
  return Math.round((completeWeight / totalWeight) * 100);
}

export function isReadyForAssessment(requirements: readonly ProgressRequirement[], progress: readonly ProgressRecord[]): boolean {
  return calculateProgress(requirements, progress) === 100;
}
