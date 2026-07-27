import { describe, expect, it } from "vitest";

import { buildEnrollmentProgressReadModel } from "@/modules/progress/application/progress-read-model";

const root = { id: "root", optional: false, weight: 1, allowReuse: false, sectionId: "section-a", position: 0, title: "Complete the checklist", instructions: "", requirementType: "compound", requiresEvidence: false, progressMode: "derived" as const, completionSemantics: "all_children" as const, modalities: ["administrative"] as const };
const child = { id: "child", parentRequirementId: "root", optional: false, weight: 0, allowReuse: false, sectionId: "section-a", position: 0, title: "Checklist item", instructions: "", requirementType: "text", requiresEvidence: false, progressMode: "direct" as const, completionSemantics: "direct" as const, childRole: "checklist_item" as const, modalities: ["reading"] as const };
const textRoot = { id: "text-root", optional: false, weight: 1, allowReuse: false, sectionId: "section-b", position: 0, title: "Reading reflection", instructions: "", requirementType: "text", requiresEvidence: false, progressMode: "direct" as const, completionSemantics: "direct" as const, modalities: ["reading"] as const };

describe("hierarchical learner read model", () => {
  it("orders sections, derives root completion from children, and does not inflate section/root percentages", () => {
    const model = buildEnrollmentProgressReadModel({ enrollmentId: "enrollment", catalogTitle: "Amigo", schoolYear: 2026, sections: [{ id: "section-b", title: "Second", position: 1 }, { id: "section-a", title: "First", position: 0 }], requirements: [root, child, textRoot], progress: [{ progressId: "child-progress", requirementId: "child", status: "accepted" }], attempts: new Map() });
    expect(model.sections.map((section) => section.title)).toEqual(["First", "Second"]);
    expect(model.sections[0].approvedPercentage).toBe(100);
    expect(model.sections[1].approvedPercentage).toBe(0);
    expect(model.approvedPercentage).toBe(50);
    expect(model.sections[0].requirements[0]).toMatchObject({ complete: true, canSubmitText: false, children: [expect.objectContaining({ title: "Checklist item", childRole: "checklist_item", canSubmitText: false })] });
  });

  it("allows text submission only for a direct root without practical or evidence requirements", () => {
    const model = buildEnrollmentProgressReadModel({ enrollmentId: "enrollment", catalogTitle: "Amigo", schoolYear: 2026, sections: [{ id: "section-b", title: "Second", position: 0 }], requirements: [textRoot], progress: [{ progressId: "text-progress", requirementId: "text-root", status: "draft" }], attempts: new Map() });
    expect(model.sections[0].requirements[0].canSubmitText).toBe(true);
  });
});
