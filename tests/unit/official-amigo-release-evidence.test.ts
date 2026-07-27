import amigoRegularSnapshot from "@/modules/catalog/infrastructure/official/amigo-regular.es.json";
import { describe, expect, it } from "vitest";
import { buildEnrollmentProgressReadModel, type ProgressRequirementRow } from "@/modules/progress/application/progress-read-model";
import { calculateProgress, calculateSectionProgress, isRequirementComplete } from "@/modules/progress/domain/progress";
import { validateOfficialRegularAmigoSnapshot } from "@/modules/catalog/domain/official-template";

describe("official Amigo release evidence", () => {
  it("keeps canonical provisioning input, hierarchy completion, and root-only percentages aligned", () => {
    const validation = validateOfficialRegularAmigoSnapshot(amigoRegularSnapshot);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const bibleRoot = validation.value.requirements.find((requirement) => requirement.sourceCode === "amigo.reg.s02.r03");
    const bibleChildren = validation.value.requirements.filter((requirement) => requirement.parentSourceCode === "amigo.reg.s02.r03");
    expect(bibleRoot).toBeDefined();
    expect(bibleChildren).toHaveLength(59);

    const requirements: ProgressRequirementRow[] = validation.value.requirements.map((requirement) => ({
      id: requirement.id,
      parentRequirementId: "parentSourceCode" in requirement ? validation.value.requirements.find((parent) => parent.sourceCode === requirement.parentSourceCode)?.id ?? null : null,
      optional: requirement.optional,
      weight: requirement.weight,
      sectionId: validation.value.sections.find((section) => section.sourceCode === requirement.sectionCode)?.id ?? null,
      modalities: requirement.modalities,
      progressMode: requirement.completion.kind === "direct" ? "direct" : "derived",
      completionSemantics: requirement.completion.kind,
      completionThreshold: requirement.completion.kind === "at_least_n" ? requirement.completion.threshold : null,
      childRole: "childRole" in requirement ? requirement.childRole : null,
      allowReuse: false,
      title: requirement.title,
      instructions: "",
      requirementType: requirement.requirementType,
      requiresEvidence: false,
      position: requirement.position,
    }));
    const acceptedChildren = bibleChildren.map((requirement) => ({ requirementId: requirement.id, status: "accepted" as const }));

    expect(isRequirementComplete(bibleRoot!.id, requirements, acceptedChildren)).toBe(true);
    expect(calculateProgress(requirements, acceptedChildren)).toBe(4);
    expect(calculateSectionProgress(validation.value.sections[1]!.id, requirements, acceptedChildren)).toBe(33);

    const model = buildEnrollmentProgressReadModel({
      enrollmentId: "enrollment-a",
      catalogTitle: "Amigo",
      schoolYear: 2026,
      sections: validation.value.sections.map((section) => ({ id: section.id, title: section.title, position: section.position })),
      requirements,
      progress: acceptedChildren.map((record, index) => ({ ...record, progressId: `progress-${index}` })),
      attempts: new Map(),
    });
    const spiritual = model.sections.find((section) => section.title === "Descubrimiento espiritual")!;
    const projectedBibleRoot = spiritual.requirements.find((requirement) => requirement.requirementId === bibleRoot!.id)!;
    expect(projectedBibleRoot.complete).toBe(true);
    expect(projectedBibleRoot.canSubmitText).toBe(false);
    expect(projectedBibleRoot.children).toHaveLength(59);
  });

  it("retains the legacy direct-text projection beside official hierarchy behavior", () => {
    const model = buildEnrollmentProgressReadModel({
      enrollmentId: "legacy-enrollment",
      catalogTitle: "STG Amigo Text Workflow",
      schoolYear: 2026,
      requirements: [{
        id: "legacy-text",
        optional: false,
        weight: 1,
        allowReuse: false,
        title: "Legacy text requirement",
        instructions: "Submit text",
        requirementType: "text",
        requiresEvidence: false,
        position: 0,
      }],
      progress: [{ progressId: "legacy-progress", requirementId: "legacy-text", status: "draft" }],
      attempts: new Map(),
    });

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0]).toMatchObject({ title: "Requirements", approvedPercentage: 0 });
    expect(model.sections[0]!.requirements[0]!.canSubmitText).toBe(true);
  });
});
