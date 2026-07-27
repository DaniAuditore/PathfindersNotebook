import { describe, expect, it } from "vitest";

import {
  assertOfficialTemplateContract,
  progressModeFor,
  type OfficialClassTemplate,
} from "@/modules/catalog/domain/official-template";
import {
  calculateProgress,
  calculateProgressRatio,
  calculateSectionProgress,
  isRequirementComplete,
  type ProgressRecord,
  type ProgressRequirement,
} from "@/modules/progress/domain/progress";

function template(requirements: OfficialClassTemplate["requirements"]): OfficialClassTemplate {
  return {
    source: {
      sourceCode: "dsa.amigo.es",
      authority: "DSA",
      locale: "es",
      documentSha256: "a".repeat(64),
      revisionKey: "undated-pdf",
      isUndated: true,
      provenance: "Visible PDF pages",
      transcriptionNotes: "Visual source overrides OCR",
    },
    family: { familyCode: "amigo", title: "Amigo" },
    level: { levelCode: "amigo.regular", familyCode: "amigo", sourceCode: "dsa.amigo.es", classType: "regular", title: "Amigo", position: 0, relatedLevelCode: "amigo.naturaleza" },
    sections: [{ sourceCode: "generales", title: "Generales", position: 0 }],
    requirements,
  };
}

describe("official template domain contract", () => {
  it("accepts stable hierarchy metadata with unit roots and zero-weight children", () => {
    const value = template([
      { sourceCode: "general.1", sectionCode: "generales", title: "Root", position: 0, optional: false, modalities: ["reading"], completion: { kind: "all_children" }, weight: 1 },
      { sourceCode: "general.1.a", sectionCode: "generales", parentSourceCode: "general.1", childRole: "checklist_item", title: "Child", position: 0, optional: false, modalities: ["reading"], completion: { kind: "direct" }, weight: 0 },
    ]);

    expect(() => assertOfficialTemplateContract(value)).not.toThrow();
    expect(progressModeFor({ kind: "all_children" })).toBe("derived");
  });

  it("rejects weighted children and invalid thresholds before infrastructure", () => {
    const invalid = template([
      { sourceCode: "general.1", sectionCode: "generales", title: "Root", position: 0, optional: false, modalities: ["reading"], completion: { kind: "at_least_n", threshold: 0 }, weight: 1 },
    ]);
    expect(() => assertOfficialTemplateContract(invalid)).toThrow("positive integer threshold");
  });

  it("binds the level to the declared official source", () => {
    const invalid = template([]);
    invalid.level.sourceCode = "dsa.other.es";

    expect(() => assertOfficialTemplateContract(invalid)).toThrow("declared official source");
  });
});

describe("hierarchical progress contract", () => {
  const requirements: readonly ProgressRequirement[] = [
    { id: "root-a", sectionId: "section-a", optional: false, weight: 1, allowReuse: false, progressMode: "derived", completionSemantics: "all_children" },
    { id: "child-a", sectionId: "section-a", parentRequirementId: "root-a", optional: false, weight: 0, allowReuse: false, progressMode: "direct", completionSemantics: "direct" },
    { id: "root-b", sectionId: "section-b", optional: false, weight: 1, allowReuse: false, progressMode: "direct", completionSemantics: "direct" },
  ];
  const progress: readonly ProgressRecord[] = [{ requirementId: "child-a", status: "accepted" }];

  it("derives parent completion while only roots contribute to the denominator", () => {
    expect(isRequirementComplete("root-a", requirements, progress)).toBe(true);
    expect(calculateProgress(requirements, progress)).toBe(50);
    expect(calculateSectionProgress("section-a", requirements, progress)).toBe(100);
    expect(calculateSectionProgress("section-b", requirements, progress)).toBe(0);
  });

  it("gives each of 25 official roots exactly one denominator unit", () => {
    const roots = Array.from({ length: 25 }, (_, index): ProgressRequirement => ({ id: `root-${index}`, optional: false, weight: 1, allowReuse: false, progressMode: "direct", completionSemantics: "direct" }));
    expect(calculateProgressRatio(roots, [{ requirementId: "root-0", status: "accepted" }])).toBe(1 / 25);
    expect(calculateProgress(roots, [{ requirementId: "root-0", status: "accepted" }])).toBe(4);
  });

  it("supports at_least_one and valid at_least_n derived completion", () => {
    const compound: readonly ProgressRequirement[] = [
      { id: "one", optional: false, weight: 1, allowReuse: false, progressMode: "derived", completionSemantics: "at_least_one" },
      { id: "one-a", parentRequirementId: "one", optional: false, weight: 0, allowReuse: false },
      { id: "many", optional: false, weight: 1, allowReuse: false, progressMode: "derived", completionSemantics: "at_least_n", completionThreshold: 2 },
      { id: "many-a", parentRequirementId: "many", optional: false, weight: 0, allowReuse: false },
      { id: "many-b", parentRequirementId: "many", optional: false, weight: 0, allowReuse: false },
    ];
    const accepted = [
      { requirementId: "one-a", status: "accepted" as const },
      { requirementId: "many-a", status: "accepted" as const },
      { requirementId: "many-b", status: "accepted" as const },
    ];

    expect(isRequirementComplete("one", compound, accepted)).toBe(true);
    expect(isRequirementComplete("many", compound, accepted)).toBe(true);
  });

  it.each([undefined, null, 0, -1, 1.5])("rejects malformed at_least_n threshold %s", (completionThreshold) => {
    const malformed: readonly ProgressRequirement[] = [
      { id: "root", optional: false, weight: 1, allowReuse: false, progressMode: "derived", completionSemantics: "at_least_n", completionThreshold },
      { id: "child", parentRequirementId: "root", optional: false, weight: 0, allowReuse: false },
    ];

    expect(() => isRequirementComplete("root", malformed, [])).toThrow("positive integer completion threshold");
  });
});
