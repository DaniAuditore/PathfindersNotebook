export type ProgressStatus = "draft" | "submitted" | "accepted" | "rejected";
export type CompletionRule = "all" | "any" | "minimum_n";
export type RequirementModality = "administrative" | "automatic" | "reading" | "memorization_oral" | "written" | "participation" | "specialty" | "practical_in_person";
export type CompletionSemantics = "direct" | "all_children" | "at_least_one" | "at_least_n";

export interface ProgressRequirement {
  id: string;
  parentRequirementId?: string | null;
  optional: boolean;
  weight: number;
  completionRule?: CompletionRule | null;
  minimumChildren?: number | null;
  allowReuse: boolean;
  sectionId?: string | null;
  sourceCode?: string | null;
  modalities?: readonly RequirementModality[] | null;
  progressMode?: "direct" | "derived" | null;
  completionSemantics?: CompletionSemantics | null;
  completionThreshold?: number | null;
  childRole?: "step" | "option" | "checklist_item" | null;
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

function isComplete(requirement: ProgressRequirement, requirements: readonly ProgressRequirement[], progress: ReadonlyMap<string, ProgressRecord>, ancestors: ReadonlySet<string>): boolean {
  if (ancestors.has(requirement.id)) return false;
  const nextAncestors = new Set(ancestors).add(requirement.id);
  const children = requirements.filter((item) => item.parentRequirementId === requirement.id);
  if (children.length === 0) return requirement.progressMode !== "derived" && progress.get(requirement.id)?.status === "accepted";
  const completed = children.filter((child) => isComplete(child, requirements, progress, nextAncestors)).length;
  if (requirement.completionSemantics === "at_least_one") return completed >= 1;
  if (requirement.completionSemantics === "at_least_n") {
    const threshold = requirement.completionThreshold;
    if (threshold === null || threshold === undefined || !Number.isInteger(threshold) || threshold < 1) {
      throw new Error("at_least_n requires a positive integer completion threshold");
    }
    return completed >= threshold;
  }
  if (requirement.completionSemantics === "all_children") return completed === children.length;
  if (requirement.completionSemantics === "direct") return progress.get(requirement.id)?.status === "accepted";
  if (requirement.completionRule === "any") return completed >= 1;
  if (requirement.completionRule === "minimum_n") return completed >= (requirement.minimumChildren ?? 0);
  return completed === children.length;
}

export function isRequirementComplete(requirementId: string, requirements: readonly ProgressRequirement[], progress: readonly ProgressRecord[]): boolean {
  const requirement = requirements.find((item) => item.id === requirementId);
  if (!requirement) return false;
  return isComplete(requirement, requirements, new Map(progress.map((item) => [item.requirementId, item])), new Set());
}

export function calculateProgress(requirements: readonly ProgressRequirement[], progress: readonly ProgressRecord[]): number {
  return Math.round(calculateProgressRatio(requirements, progress) * 100);
}

export function calculateProgressRatio(requirements: readonly ProgressRequirement[], progress: readonly ProgressRecord[]): number {
  const byRequirement = new Map(progress.map((item) => [item.requirementId, item]));
  const roots = requirements.filter((item) => !item.parentRequirementId && !item.optional);
  const totalWeight = roots.reduce((total, item) => total + item.weight, 0);
  if (totalWeight === 0) return 0;
  const completeWeight = roots.filter((item) => isComplete(item, requirements, byRequirement, new Set())).reduce((total, item) => total + item.weight, 0);
  return completeWeight / totalWeight;
}

export function calculateSectionProgress(sectionId: string, requirements: readonly ProgressRequirement[], progress: readonly ProgressRecord[]): number {
  return calculateProgress(requirements.filter((item) => item.sectionId === sectionId), progress);
}

export function isReadyForAssessment(requirements: readonly ProgressRequirement[], progress: readonly ProgressRecord[]): boolean {
  return calculateProgress(requirements, progress) === 100;
}
