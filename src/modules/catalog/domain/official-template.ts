import type { ClassType } from "./class-type";
import {
  CANONICAL_AMIGO_FAMILY,
  CANONICAL_AMIGO_LEVEL,
  CANONICAL_AMIGO_REQUIREMENTS,
  CANONICAL_AMIGO_SECTIONS,
  CANONICAL_AMIGO_SOURCE,
  canonicalRequirementSemantics,
} from "./amigo-regular-canonical-contract";

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

export interface OfficialSnapshotValidationError {
  code:
    | "advanced_content"
    | "bible_contract"
    | "canonical_drift"
    | "child_count"
    | "child_group_count"
    | "child_weight"
    | "completion_semantics"
    | "deterministic_id"
    | "duplicate_code"
    | "duplicate_id"
    | "hierarchy_cycle"
    | "hierarchy_reference"
    | "invalid_code"
    | "invalid_modality"
    | "invalid_position"
    | "invalid_provenance"
    | "invalid_shape"
    | "root_count"
    | "root_distribution"
    | "root_weight"
    | "row_count"
    | "section_count"
    | "unsupported_schema_version";
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly OfficialSnapshotValidationError[] };

export type OfficialRequirementType = "manual" | "file" | "link" | "text" | "checklist" | "numeric" | "compound";

export interface OfficialSnapshotNamespace {
  readonly id: string;
  readonly name: string;
  readonly algorithm: "UUIDv5-SHA1";
  readonly entityName: "sourceCode";
}

export interface OfficialSnapshotSource extends OfficialSourceProvenance {
  readonly id: string;
  readonly documentTitle: string;
  readonly visualPageReferences: readonly number[];
}

export interface OfficialSnapshotFamily extends OfficialClassFamily {
  readonly id: string;
}

export interface OfficialSnapshotLevel extends OfficialClassLevel {
  readonly id: string;
}

export interface OfficialSnapshotSection extends OfficialCatalogSection {
  readonly id: string;
  readonly officialCode: string;
  readonly slug: string;
  readonly visualPageReferences: readonly number[];
}

export type OfficialSnapshotRequirement = OfficialRequirement & {
  readonly id: string;
  readonly requirementType: OfficialRequirementType;
  readonly visualPageReferences: readonly number[];
};

/** The fully validated payload consumed by official-catalog provisioning. */
export interface OfficialRegularAmigoSnapshot {
  readonly schemaVersion: 1;
  readonly uuidNamespace: OfficialSnapshotNamespace;
  readonly source: OfficialSnapshotSource;
  readonly family: OfficialSnapshotFamily;
  readonly level: OfficialSnapshotLevel;
  readonly sections: readonly OfficialSnapshotSection[];
  readonly requirements: readonly OfficialSnapshotRequirement[];
}

const STABLE_CODE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const AMIGO_REGULAR_CONTRACT = {
  schemaVersion: 1,
  namespaceId: "f40933a4-a747-5677-ab51-8b89aaaefb4e",
  namespaceName: "pathfindersnotebook.catalog.official",
  sourceCode: "dsa.amigo.es",
  authority: "División Sudamericana, Ministerio de Conquistadores y Aventureros",
  locale: "es",
  documentSha256: "c29d62235ebfb819a89759f01af8e98858817ce3bc2d9947b5af11b652ad139a",
  revisionKey: "dsa-amigo-official-card-es-undated",
  familyCode: "amigo",
  levelCode: "amigo.regular",
  rootDistribution: [6, 3, 2, 2, 3, 1, 3, 4, 1],
  childGroups: new Map<string, number>([
    ["amigo.reg.s02.r01", 4],
    ["amigo.reg.s02.r02", 4],
    ["amigo.reg.s02.r03", 59],
    ["amigo.reg.s03.r01", 3],
    ["amigo.reg.s05.r01", 4],
    ["amigo.reg.s05.r02", 3],
    ["amigo.reg.s07.r01", 5],
    ["amigo.reg.s08.r01", 14],
  ]),
} as const;

const MODALITIES = new Set<RequirementModality>([
  "administrative",
  "automatic",
  "reading",
  "memorization_oral",
  "written",
  "participation",
  "specialty",
  "practical_in_person",
]);
const REQUIREMENT_TYPES = new Set<OfficialRequirementType>(["manual", "file", "link", "text", "checklist", "numeric", "compound"]);

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

/**
 * Validates an untrusted official regular-Amigo payload without throwing.
 * AC5 can pass the successful value directly to its transactional provisioning port.
 */
export function validateOfficialRegularAmigoSnapshot(input: unknown): ValidationResult<OfficialRegularAmigoSnapshot> {
  const errors: OfficialSnapshotValidationError[] = [];
  const add = (code: OfficialSnapshotValidationError["code"], path: string, message: string): void => {
    errors.push({ code, path, message });
  };

  try {
    if (!isRecord(input)) {
      add("invalid_shape", "$", "snapshot must be a JSON object");
      return { ok: false, errors };
    }
    if (input.schemaVersion !== AMIGO_REGULAR_CONTRACT.schemaVersion) {
      add("unsupported_schema_version", "schemaVersion", `supported schema version is ${AMIGO_REGULAR_CONTRACT.schemaVersion}`);
    }

    const namespace = recordAt(input, "uuidNamespace", errors);
    const source = recordAt(input, "source", errors);
    const family = recordAt(input, "family", errors);
    const level = recordAt(input, "level", errors);
    const sections = recordsAt(input, "sections", errors);
    const requirements = recordsAt(input, "requirements", errors);
    if (!namespace || !source || !family || !level || !sections || !requirements) return { ok: false, errors };

    validateProvenance(namespace, source, family, level, add);
    validatePayloadShape(source, family, level, sections, requirements, add);
    validateCodesAndIds(source, family, level, sections, requirements, add);

    const roots = requirements.filter((requirement) => typeof requirement.parentSourceCode !== "string");
    const children = requirements.filter((requirement) => typeof requirement.parentSourceCode === "string");
    if (sections.length !== 9) add("section_count", "sections", `expected exactly 9 sections; received ${sections.length}`);
    if (roots.length !== 25) add("root_count", "requirements", `expected exactly 25 roots; received ${roots.length}`);
    if (children.length !== 96) add("child_count", "requirements", `expected exactly 96 children; received ${children.length}`);
    if (requirements.length !== 121) add("row_count", "requirements", `expected exactly 121 requirement rows; received ${requirements.length}`);

    validatePositionsAndDistribution(sections, roots, children, add);
    validateHierarchyAndRules(sections, requirements, roots, children, add);
    validateBibleAndGroups(requirements, add);
    validateRegularOnly(input, source, family, level, sections, requirements, add);
    validateCanonicalContract(source, family, level, sections, requirements, add);

    return errors.length === 0
      ? { ok: true, value: input as unknown as OfficialRegularAmigoSnapshot }
      : { ok: false, errors };
  } catch (error) {
    add("invalid_shape", "$", `snapshot could not be validated: ${error instanceof Error ? error.message : "unknown input error"}`);
    return { ok: false, errors };
  }
}

type AddValidationError = (code: OfficialSnapshotValidationError["code"], path: string, message: string) => void;

function validatePayloadShape(
  source: Readonly<Record<string, unknown>>,
  family: Readonly<Record<string, unknown>>,
  level: Readonly<Record<string, unknown>>,
  sections: readonly Readonly<Record<string, unknown>>[],
  requirements: readonly Readonly<Record<string, unknown>>[],
  add: AddValidationError,
): void {
  for (const [value, path] of [
    [source.documentTitle, "source.documentTitle"],
    [family.title, "family.title"],
    [level.title, "level.title"],
  ] as const) {
    if (typeof value !== "string" || value.trim() === "") add("invalid_shape", path, `${path} must be a nonblank string`);
  }
  if (level.relatedLevelCode !== undefined && (typeof level.relatedLevelCode !== "string" || !isStableSourceCode(level.relatedLevelCode))) {
    add("invalid_shape", "level.relatedLevelCode", "related level code must use the stable source-code format when present");
  }
  for (const [index, section] of sections.entries()) {
    const path = `sections[${index}]`;
    if (typeof section.title !== "string" || section.title.trim() === "") add("invalid_shape", `${path}.title`, "section title must be nonblank");
    if (typeof section.slug !== "string" || !isStableSourceCode(section.slug)) add("invalid_shape", `${path}.slug`, "section slug must be stable");
    if (typeof section.officialCode !== "string") add("invalid_shape", `${path}.officialCode`, "official section code must be a string");
    if (!isPositiveIntegerArray(section.visualPageReferences)) add("invalid_shape", `${path}.visualPageReferences`, "visual page references must be positive integers");
  }
  for (const [index, requirement] of requirements.entries()) {
    const path = `requirements[${index}]`;
    if (typeof requirement.title !== "string" || requirement.title.trim() === "") add("invalid_shape", `${path}.title`, "requirement title must be nonblank");
    if (typeof requirement.optional !== "boolean") add("invalid_shape", `${path}.optional`, "optional must be boolean");
    if (!isPositiveIntegerArray(requirement.visualPageReferences)) add("invalid_shape", `${path}.visualPageReferences`, "visual page references must be positive integers");
    if (Object.hasOwn(requirement, "parentSourceCode") && typeof requirement.parentSourceCode !== "string") {
      add("invalid_shape", `${path}.parentSourceCode`, "parent source code must be a string when present");
    }
  }
}

function validateProvenance(
  namespace: Readonly<Record<string, unknown>>,
  source: Readonly<Record<string, unknown>>,
  family: Readonly<Record<string, unknown>>,
  level: Readonly<Record<string, unknown>>,
  add: AddValidationError,
): void {
  const expected: readonly [Readonly<Record<string, unknown>>, string, unknown, string][] = [
    [namespace, "id", AMIGO_REGULAR_CONTRACT.namespaceId, "uuidNamespace.id"],
    [namespace, "name", AMIGO_REGULAR_CONTRACT.namespaceName, "uuidNamespace.name"],
    [namespace, "algorithm", "UUIDv5-SHA1", "uuidNamespace.algorithm"],
    [namespace, "entityName", "sourceCode", "uuidNamespace.entityName"],
    [source, "sourceCode", AMIGO_REGULAR_CONTRACT.sourceCode, "source.sourceCode"],
    [source, "authority", AMIGO_REGULAR_CONTRACT.authority, "source.authority"],
    [source, "locale", AMIGO_REGULAR_CONTRACT.locale, "source.locale"],
    [source, "documentSha256", AMIGO_REGULAR_CONTRACT.documentSha256, "source.documentSha256"],
    [source, "revisionKey", AMIGO_REGULAR_CONTRACT.revisionKey, "source.revisionKey"],
    [source, "isUndated", true, "source.isUndated"],
    [family, "familyCode", AMIGO_REGULAR_CONTRACT.familyCode, "family.familyCode"],
    [level, "levelCode", AMIGO_REGULAR_CONTRACT.levelCode, "level.levelCode"],
    [level, "familyCode", AMIGO_REGULAR_CONTRACT.familyCode, "level.familyCode"],
    [level, "sourceCode", AMIGO_REGULAR_CONTRACT.sourceCode, "level.sourceCode"],
    [level, "classType", "regular", "level.classType"],
    [level, "position", 0, "level.position"],
  ];
  for (const [record, key, value, path] of expected) {
    if (record[key] !== value) add("invalid_provenance", path, `expected ${JSON.stringify(value)}; received ${JSON.stringify(record[key])}`);
  }
  if (!SHA256.test(String(source.documentSha256 ?? ""))) add("invalid_provenance", "source.documentSha256", "source hash must be a lowercase SHA-256");
  if (typeof source.provenance !== "string" || source.provenance.trim() === "") add("invalid_provenance", "source.provenance", "source provenance must be nonblank");
  if (typeof source.transcriptionNotes !== "string" || source.transcriptionNotes.trim() === "") add("invalid_provenance", "source.transcriptionNotes", "transcription notes must be nonblank");
  if (Object.hasOwn(source, "editionYear")) add("invalid_provenance", "source.editionYear", "the undated source must not invent an edition year");
  if (!numberArrayEquals(source.visualPageReferences, [2, 3, 4, 5])) add("invalid_provenance", "source.visualPageReferences", "visual provenance must reference pages 2–5 in order");
}

function validateCodesAndIds(
  source: Readonly<Record<string, unknown>>,
  family: Readonly<Record<string, unknown>>,
  level: Readonly<Record<string, unknown>>,
  sections: readonly Readonly<Record<string, unknown>>[],
  requirements: readonly Readonly<Record<string, unknown>>[],
  add: AddValidationError,
): void {
  const entities = [
    { entity: source, codeKey: "sourceCode", path: "source", expectedCode: CANONICAL_AMIGO_SOURCE.sourceCode, expectedId: CANONICAL_AMIGO_SOURCE.id },
    { entity: family, codeKey: "familyCode", path: "family", expectedCode: CANONICAL_AMIGO_FAMILY.sourceCode, expectedId: CANONICAL_AMIGO_FAMILY.id },
    { entity: level, codeKey: "levelCode", path: "level", expectedCode: CANONICAL_AMIGO_LEVEL.sourceCode, expectedId: CANONICAL_AMIGO_LEVEL.id },
    ...sections.map((entity, index) => ({
      entity,
      codeKey: "sourceCode",
      path: `sections[${index}]`,
      expectedCode: CANONICAL_AMIGO_SECTIONS[index]?.[0],
      expectedId: CANONICAL_AMIGO_SECTIONS[index]?.[1],
    })),
    ...requirements.map((entity, index) => ({
      entity,
      codeKey: "sourceCode",
      path: `requirements[${index}]`,
      expectedCode: CANONICAL_AMIGO_REQUIREMENTS[index]?.[0],
      expectedId: CANONICAL_AMIGO_REQUIREMENTS[index]?.[1],
    })),
  ];
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const { entity, codeKey, path, expectedCode, expectedId } of entities) {
    const code = entity[codeKey];
    const id = entity.id;
    if (typeof code !== "string" || !isStableSourceCode(code)) add("invalid_code", `${path}.${codeKey}`, "code must use the stable lowercase source-code format");
    else if (codes.has(code)) add("duplicate_code", `${path}.${codeKey}`, `duplicate code ${code}`);
    else codes.add(code);
    if (typeof id !== "string" || !UUID.test(id)) add("deterministic_id", `${path}.id`, "id must be a lowercase RFC 4122 UUID");
    else if (ids.has(id)) add("duplicate_id", `${path}.id`, `duplicate id ${id}`);
    else ids.add(id);
    if (typeof id === "string" && expectedCode && expectedId && id !== expectedId) {
      add("deterministic_id", `${path}.id`, `expected UUIDv5 ${expectedId} derived from ${expectedCode}`);
    }
  }
}

function validatePositionsAndDistribution(
  sections: readonly Readonly<Record<string, unknown>>[],
  roots: readonly Readonly<Record<string, unknown>>[],
  children: readonly Readonly<Record<string, unknown>>[],
  add: AddValidationError,
): void {
  assertContiguousPositions(sections, "sections", add);
  const distribution: number[] = [];
  for (let sectionIndex = 0; sectionIndex < 9; sectionIndex += 1) {
    const sectionCode = `amigo.reg.s${pad2(sectionIndex + 1)}`;
    const section = sections[sectionIndex];
    if (section?.sourceCode !== sectionCode) add("invalid_code", `sections[${sectionIndex}].sourceCode`, `expected deterministic section code ${sectionCode}`);
    if (section?.officialCode !== `AMI-REG-S${pad2(sectionIndex + 1)}`) add("invalid_code", `sections[${sectionIndex}].officialCode`, "official section code does not match its ordered section");
    const sectionRoots = roots.filter((root) => root.sectionCode === sectionCode);
    distribution.push(sectionRoots.length);
    assertContiguousPositions(sectionRoots, `requirements roots in ${sectionCode}`, add);
    for (const root of sectionRoots) {
      const expectedCode = `${sectionCode}.r${pad2(Number(root.position) + 1)}`;
      if (root.sourceCode !== expectedCode) add("invalid_code", `requirements.${String(root.sourceCode)}.sourceCode`, `expected deterministic root code ${expectedCode}`);
    }
  }
  if (!numberArrayEquals(distribution, AMIGO_REGULAR_CONTRACT.rootDistribution)) {
    add("root_distribution", "requirements", `expected root distribution ${AMIGO_REGULAR_CONTRACT.rootDistribution.join("/")}; received ${distribution.join("/")}`);
  }
  const parentCodes = new Set(children.map((child) => child.parentSourceCode).filter((code): code is string => typeof code === "string"));
  for (const parentCode of parentCodes) {
    const siblings = children.filter((child) => child.parentSourceCode === parentCode);
    assertContiguousPositions(siblings, `children of ${parentCode}`, add);
    for (const child of siblings) {
      const expectedCode = `${parentCode}.c${pad2(Number(child.position) + 1)}`;
      if (child.sourceCode !== expectedCode) add("invalid_code", `requirements.${String(child.sourceCode)}.sourceCode`, `expected deterministic child code ${expectedCode}`);
    }
  }
}

function validateHierarchyAndRules(
  sections: readonly Readonly<Record<string, unknown>>[],
  requirements: readonly Readonly<Record<string, unknown>>[],
  roots: readonly Readonly<Record<string, unknown>>[],
  children: readonly Readonly<Record<string, unknown>>[],
  add: AddValidationError,
): void {
  const sectionCodes = new Set(sections.map((section) => section.sourceCode));
  const byCode = new Map(requirements.map((requirement) => [requirement.sourceCode, requirement]));
  for (const [index, requirement] of requirements.entries()) {
    const path = `requirements[${index}]`;
    if (!sectionCodes.has(requirement.sectionCode)) add("hierarchy_reference", `${path}.sectionCode`, "requirement references an unknown section");
    const modalities = requirement.modalities;
    if (!Array.isArray(modalities) || modalities.length === 0 || modalities.some((modality) => !MODALITIES.has(modality as RequirementModality))) {
      add("invalid_modality", `${path}.modalities`, "requirement must use one or more supported AC1 modalities");
    }
    if (!REQUIREMENT_TYPES.has(requirement.requirementType as OfficialRequirementType)) {
      add("completion_semantics", `${path}.requirementType`, "requirement type is not supported by the AC1 catalog contract");
    }
    const parentCode = requirement.parentSourceCode;
    if (typeof parentCode === "string") {
      const parent = byCode.get(parentCode);
      if (!parent) add("hierarchy_reference", `${path}.parentSourceCode`, `parent ${parentCode} does not exist`);
      else if (parent.sectionCode !== requirement.sectionCode) add("hierarchy_reference", `${path}.sectionCode`, "child and parent must belong to the same section");
      if (requirement.weight !== 0) add("child_weight", `${path}.weight`, "official children must have zero weight");
      if (requirement.completion === null || !isRecord(requirement.completion) || requirement.completion.kind !== "direct") add("completion_semantics", `${path}.completion`, "children must use direct completion");
      if (!new Set(["step", "option", "checklist_item"]).has(String(requirement.childRole))) add("completion_semantics", `${path}.childRole`, "child role must be step, option, or checklist_item");
    } else {
      if (requirement.weight !== 1 || requirement.optional !== false) add("root_weight", `${path}.weight`, "mandatory official roots must have unit weight");
    }
  }

  for (const requirement of requirements) {
    const seen = new Set<unknown>();
    let current: Readonly<Record<string, unknown>> | undefined = requirement;
    while (current && typeof current.parentSourceCode === "string") {
      if (seen.has(current.sourceCode)) {
        add("hierarchy_cycle", `requirements.${String(requirement.sourceCode)}.parentSourceCode`, "requirement hierarchy contains a cycle");
        break;
      }
      seen.add(current.sourceCode);
      current = byCode.get(current.parentSourceCode);
    }
  }

  for (const root of roots) {
    const rootChildren = children.filter((child) => child.parentSourceCode === root.sourceCode);
    const completion = root.completion;
    const kind = isRecord(completion) ? completion.kind : undefined;
    const path = `requirements.${String(root.sourceCode)}.completion`;
    const validKind = kind === "direct" || kind === "all_children" || kind === "at_least_one" || kind === "at_least_n";
    if (!validKind) add("completion_semantics", path, "root completion kind is unsupported");
    if (rootChildren.length === 0 && kind !== "direct") add("completion_semantics", path, "a root without children must use direct completion");
    if (rootChildren.length > 0 && kind === "direct") add("completion_semantics", path, "a compound root must derive completion from its children");
    if (kind === "at_least_n") {
      const threshold = isRecord(completion) ? completion.threshold : undefined;
      if (!Number.isInteger(threshold) || Number(threshold) < 1 || Number(threshold) > rootChildren.length) {
        add("completion_semantics", `${path}.threshold`, `threshold must be a positive integer no greater than ${rootChildren.length}`);
      }
    } else if (isRecord(completion) && Object.hasOwn(completion, "threshold")) {
      add("completion_semantics", `${path}.threshold`, "only at_least_n may declare a threshold");
    }
    const requirementType = root.requirementType;
    if ((rootChildren.length > 0) !== (requirementType === "compound")) add("completion_semantics", `requirements.${String(root.sourceCode)}.requirementType`, "compound type must exactly match roots with children");
  }
}

function validateBibleAndGroups(requirements: readonly Readonly<Record<string, unknown>>[], add: AddValidationError): void {
  for (const [parentCode, expectedCount] of AMIGO_REGULAR_CONTRACT.childGroups) {
    const actual = requirements.filter((requirement) => requirement.parentSourceCode === parentCode).length;
    if (actual !== expectedCount) add("child_group_count", `requirements.${parentCode}`, `expected ${expectedCount} children; received ${actual}`);
  }
  const actualParents = new Set(requirements.filter((requirement) => typeof requirement.parentSourceCode === "string").map((requirement) => requirement.parentSourceCode));
  const unexpected = [...actualParents].filter((code) => typeof code === "string" && !AMIGO_REGULAR_CONTRACT.childGroups.has(code));
  if (unexpected.length > 0) add("child_group_count", "requirements", `unexpected child groups: ${unexpected.join(", ")}`);

  const bible = requirements
    .filter((requirement) => requirement.parentSourceCode === "amigo.reg.s02.r03")
    .sort((left, right) => Number(left.position) - Number(right.position));
  const genesis = bible.slice(0, 38);
  const exodus = bible.slice(38);
  const codesAreOrdered = bible.every((item, index) => item.sourceCode === `amigo.reg.s02.r03.c${pad2(index + 1)}`);
  const rolesAreChecklist = bible.every((item) => item.childRole === "checklist_item");
  const splitIsCorrect = genesis.length === 38 && genesis.every((item) => /^Gn\.?\s/.test(String(item.title)))
    && exodus.length === 21 && exodus.every((item) => String(item.title).startsWith("Éx "));
  if (!codesAreOrdered || !rolesAreChecklist || !splitIsCorrect) {
    add("bible_contract", "requirements.amigo.reg.s02.r03", "Bible checklist must be ordered c01–c59 with 38 Genesis labels followed by 21 Exodus labels");
  }
}

function validateRegularOnly(
  input: Readonly<Record<string, unknown>>,
  source: Readonly<Record<string, unknown>>,
  family: Readonly<Record<string, unknown>>,
  level: Readonly<Record<string, unknown>>,
  sections: readonly Readonly<Record<string, unknown>>[],
  requirements: readonly Readonly<Record<string, unknown>>[],
  add: AddValidationError,
): void {
  const codes = [source.sourceCode, family.familyCode, level.levelCode, ...sections.map((section) => section.sourceCode), ...requirements.map((requirement) => requirement.sourceCode)];
  if (level.classType !== "regular" || codes.some((code, index) => index >= 3 && (typeof code !== "string" || !code.startsWith("amigo.reg.")))) {
    add("advanced_content", "level", "regular snapshot must contain only amigo.reg section and requirement rows");
  }
  if (JSON.stringify(input).includes("amigo.naturaleza")) add("advanced_content", "$", "regular snapshot must not include advanced-level data");
}

function validateCanonicalContract(
  source: Readonly<Record<string, unknown>>,
  family: Readonly<Record<string, unknown>>,
  level: Readonly<Record<string, unknown>>,
  sections: readonly Readonly<Record<string, unknown>>[],
  requirements: readonly Readonly<Record<string, unknown>>[],
  add: AddValidationError,
): void {
  assertCanonicalValue(CANONICAL_AMIGO_SOURCE.sourceCode, "documentTitle", source.documentTitle, CANONICAL_AMIGO_SOURCE.title, add, "source.documentTitle");
  assertCanonicalValue(CANONICAL_AMIGO_FAMILY.sourceCode, "title", family.title, CANONICAL_AMIGO_FAMILY.title, add, "family.title");
  assertCanonicalValue(CANONICAL_AMIGO_LEVEL.sourceCode, "title", level.title, CANONICAL_AMIGO_LEVEL.title, add, "level.title");
  if (level.relatedLevelCode !== undefined) {
    addCanonicalDrift(String(level.levelCode), "relatedLevelCode", "must be absent", add, "level.relatedLevelCode");
  }

  for (const [index, [sourceCode, , slug, title]] of CANONICAL_AMIGO_SECTIONS.entries()) {
    const section = sections[index];
    if (!section) continue;
    if (section.slug !== slug) addCanonicalDrift(sourceCode, "slug", `expected ${slug}`, add, `sections.${sourceCode}.slug`);
    assertCanonicalValue(sourceCode, "title", section.title, title, add, `sections.${sourceCode}.title`);
  }

  for (const [index, [expectedSourceCode, , expectedTitle]] of CANONICAL_AMIGO_REQUIREMENTS.entries()) {
    const requirement = requirements[index];
    if (!requirement) continue;
    if (requirement.sourceCode !== expectedSourceCode) {
      addCanonicalDrift(expectedSourceCode, "sourceCode", `expected at requirements[${index}]; received ${String(requirement.sourceCode)}`, add);
      continue;
    }
    assertCanonicalValue(expectedSourceCode, "title", requirement.title, expectedTitle, add);
    const expected = canonicalRequirementSemantics(expectedSourceCode);
    if (!expected) {
      addCanonicalDrift(expectedSourceCode, "semantics", "canonical semantics are missing from the production contract", add);
      continue;
    }
    if (requirement.childRole !== expected.childRole) addCanonicalDrift(expectedSourceCode, "childRole", `expected ${String(expected.childRole)}`, add);
    const actualCompletion = completionFingerprint(requirement.completion);
    if (actualCompletion !== expected.completion) addCanonicalDrift(expectedSourceCode, "completion", `expected ${expected.completion}; received ${actualCompletion}`, add);
    const actualModalities = Array.isArray(requirement.modalities) ? requirement.modalities : [];
    if (!stringArrayEquals(actualModalities, expected.modalities)) {
      addCanonicalDrift(expectedSourceCode, "modalities", `expected ${expected.modalities.join("|")}; received ${actualModalities.join("|")}`, add);
    }
  }
}

function assertCanonicalValue(sourceCode: string, field: string, value: unknown, expected: string, add: AddValidationError, path?: string): void {
  if (value !== expected) addCanonicalDrift(sourceCode, field, `expected ${JSON.stringify(expected)}; received ${JSON.stringify(value)}`, add, path);
}

function addCanonicalDrift(sourceCode: string, field: string, detail: string, add: AddValidationError, path = `requirements.${sourceCode}.${field}`): void {
  add("canonical_drift", path, `sourceCode ${sourceCode} field ${field} is non-canonical: ${detail}`);
}

function completionFingerprint(value: unknown): string {
  if (!isRecord(value) || typeof value.kind !== "string") return "invalid";
  return value.kind === "at_least_n" ? `${value.kind}:${String(value.threshold)}` : value.kind;
}

function stringArrayEquals(value: readonly unknown[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function assertContiguousPositions(items: readonly Readonly<Record<string, unknown>>[], path: string, add: AddValidationError): void {
  const positions = items.map((item) => item.position);
  const expected = Array.from({ length: items.length }, (_, index) => index);
  if (!numberArrayEquals(positions, expected)) add("invalid_position", path, `positions must be unique, contiguous, and ordered from 0; received ${positions.join(",")}`);
}

function recordAt(record: Readonly<Record<string, unknown>>, key: string, errors: OfficialSnapshotValidationError[]): Readonly<Record<string, unknown>> | undefined {
  const value = record[key];
  if (isRecord(value)) return value;
  errors.push({ code: "invalid_shape", path: key, message: `${key} must be an object` });
  return undefined;
}

function recordsAt(record: Readonly<Record<string, unknown>>, key: string, errors: OfficialSnapshotValidationError[]): readonly Readonly<Record<string, unknown>>[] | undefined {
  const value = record[key];
  if (Array.isArray(value) && value.every(isRecord)) return value;
  errors.push({ code: "invalid_shape", path: key, message: `${key} must be an array of objects` });
  return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberArrayEquals(value: unknown, expected: readonly number[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function isPositiveIntegerArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => Number.isInteger(item) && item > 0);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
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
