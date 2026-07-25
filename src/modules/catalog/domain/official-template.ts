import type { ClassType } from "./class-type";

export type RequirementModality =
  | "administrative"
  | "automatic"
  | "reading"
  | "memorization_oral"
  | "written"
  | "participation"
  | "specialty"
  | "practical_in_person";

export type RequirementChildRole = "step" | "option" | "checklist_item";
export type RequirementProgressMode = "direct" | "derived";

export type CompletionSemantics =
  | { kind: "direct" }
  | { kind: "all_children" }
  | { kind: "at_least_one" }
  | { kind: "at_least_n"; threshold: number };

export interface OfficialSourceProvenance {
  sourceCode: string;
  authority: string;
  locale: string;
  documentSha256: string;
  revisionKey: string;
  isUndated: boolean;
  provenance: string;
  transcriptionNotes: string;
}

export interface OfficialClassFamily {
  familyCode: string;
  title: string;
}

export interface OfficialClassLevel {
  levelCode: string;
  familyCode: string;
  sourceCode: string;
  classType: ClassType;
  title: string;
  position: number;
  relatedLevelCode?: string;
}

export interface OfficialCatalogSection {
  sourceCode: string;
  title: string;
  position: number;
}

interface OfficialRequirementBase {
  sourceCode: string;
  sectionCode: string;
  title: string;
  position: number;
  optional: boolean;
  modalities: readonly RequirementModality[];
  completion: CompletionSemantics;
}

export interface OfficialRootRequirement extends OfficialRequirementBase {
  parentSourceCode?: never;
  childRole?: never;
  weight: 1;
}

export interface OfficialChildRequirement extends OfficialRequirementBase {
  parentSourceCode: string;
  childRole: RequirementChildRole;
  weight: 0;
}

export type OfficialRequirement = OfficialRootRequirement | OfficialChildRequirement;

export interface OfficialClassTemplate {
  source: OfficialSourceProvenance;
  family: OfficialClassFamily;
  level: OfficialClassLevel;
  sections: readonly OfficialCatalogSection[];
  requirements: readonly OfficialRequirement[];
}

const STABLE_CODE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function isStableSourceCode(value: string): boolean {
  return STABLE_CODE.test(value);
}

export function progressModeFor(completion: CompletionSemantics): RequirementProgressMode {
  return completion.kind === "direct" ? "direct" : "derived";
}

export function assertOfficialTemplateContract(template: OfficialClassTemplate): void {
  const codes = [template.source.sourceCode, template.family.familyCode, template.level.levelCode];
  if (codes.some((code) => !isStableSourceCode(code))) throw new Error("official source, family, and level codes must be stable");
  if (!SHA256.test(template.source.documentSha256)) throw new Error("official source requires a lowercase SHA-256 hash");
  if (template.source.isUndated && template.source.revisionKey.length === 0) throw new Error("undated sources require an explicit revision key");
  if (template.level.familyCode !== template.family.familyCode) throw new Error("level must belong to its declared family");
  if (template.level.sourceCode !== template.source.sourceCode) throw new Error("level must reference its declared official source");

  assertUniqueOrderedCodes(template.sections, "section");
  const sectionCodes = new Set(template.sections.map((section) => section.sourceCode));
  const requirementCodes = new Set<string>();

  for (const requirement of template.requirements) {
    if (!isStableSourceCode(requirement.sourceCode) || requirementCodes.has(requirement.sourceCode)) {
      throw new Error("requirement source codes must be stable and unique");
    }
    requirementCodes.add(requirement.sourceCode);
    if (!sectionCodes.has(requirement.sectionCode)) throw new Error("requirement must reference a declared section");
    if (requirement.modalities.length === 0) throw new Error("official requirements require at least one modality");
    if (requirement.completion.kind === "at_least_n" && (!Number.isInteger(requirement.completion.threshold) || requirement.completion.threshold < 1)) {
      throw new Error("at_least_n requires a positive integer threshold");
    }
    if (requirement.parentSourceCode !== undefined) {
      if (requirement.weight !== 0) throw new Error("official children must have zero weight");
    } else if (requirement.weight !== 1) {
      throw new Error("official roots must have unit weight");
    }
  }

  for (const requirement of template.requirements) {
    if (requirement.parentSourceCode !== undefined && !requirementCodes.has(requirement.parentSourceCode)) {
      throw new Error("official child must reference a requirement in the same template");
    }
  }
}

function assertUniqueOrderedCodes(items: readonly { sourceCode: string; position: number }[], label: string): void {
  const codes = new Set<string>();
  const positions = new Set<number>();
  for (const item of items) {
    if (!isStableSourceCode(item.sourceCode) || codes.has(item.sourceCode)) throw new Error(`${label} source codes must be stable and unique`);
    if (!Number.isInteger(item.position) || item.position < 0 || positions.has(item.position)) throw new Error(`${label} positions must be unique non-negative integers`);
    codes.add(item.sourceCode);
    positions.add(item.position);
  }
}
