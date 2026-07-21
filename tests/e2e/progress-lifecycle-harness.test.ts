import { describe, expect, it } from "vitest";

import { calculateProgress, canTransitionProgress, isReadyForAssessment, type ProgressRequirement } from "@/modules/progress/domain/progress";

const requirements: readonly ProgressRequirement[] = [{ id: "evidence-required", optional: false, weight: 1, allowReuse: false }];

describe("progress lifecycle harness", () => {
  it("models guardian submission, instructor rejection, and resubmission without losing the lifecycle", () => {
    expect(canTransitionProgress("draft", "submitted")).toBe(true);
    expect(canTransitionProgress("submitted", "rejected")).toBe(true);
    expect(canTransitionProgress("rejected", "submitted")).toBe(true);
    expect(canTransitionProgress("submitted", "accepted")).toBe(true);
  });

  it("blocks investiture readiness until every mandatory requirement is accepted", () => {
    expect(calculateProgress(requirements, [{ requirementId: "evidence-required", status: "submitted" }])).toBe(0);
    expect(isReadyForAssessment(requirements, [{ requirementId: "evidence-required", status: "submitted" }])).toBe(false);
    expect(isReadyForAssessment(requirements, [{ requirementId: "evidence-required", status: "accepted" }])).toBe(true);
  });
});
