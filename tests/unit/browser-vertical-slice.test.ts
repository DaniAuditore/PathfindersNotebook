import { describe, expect, it } from "vitest";

import { buildEnrollmentProgressReadModel, type ProgressRequirementRow, type ProgressRow, type RequirementHistoryItem } from "@/modules/progress/application/progress-read-model";
import { progressReviewSchema, textSubmissionSchema } from "@/modules/review/application/progress-commands";

const progressId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";

describe("browser progress commands", () => {
  it("requires nonblank learner text and trims accepted text", () => {
    expect(textSubmissionSchema.safeParse({ progressId, submissionText: "   " }).success).toBe(false);
    expect(textSubmissionSchema.parse({ progressId, submissionText: "  completed reading  " }).submissionText).toBe("completed reading");
  });

  it("requires a nonblank reason only when requesting changes", () => {
    expect(progressReviewSchema.safeParse({ progressId, attemptId, decision: "accepted" }).success).toBe(true);
    expect(progressReviewSchema.safeParse({ progressId, attemptId, decision: "rejected", reason: "  " }).success).toBe(false);
    expect(progressReviewSchema.parse({ progressId, attemptId, decision: "rejected", reason: "  Add the date.  " }).reason).toBe("Add the date.");
  });

  it("does not carry caller-provided club scope into a review command", () => {
    const command = progressReviewSchema.parse({ progressId, attemptId, decision: "accepted", clubId: "33333333-3333-4333-8333-333333333333" });
    expect(command).not.toHaveProperty("clubId");
  });
});

describe("learner progress read model", () => {
  it("shows latest review reason and computes approved weighted roots", () => {
    const requirements: ProgressRequirementRow[] = [
      { id: "first", title: "First", instructions: "", requirementType: "text", requiresEvidence: false, optional: false, weight: 1, allowReuse: false },
      { id: "second", title: "Second", instructions: "", requirementType: "text", requiresEvidence: false, optional: false, weight: 1, allowReuse: false },
    ];
    const progress: ProgressRow[] = [
      { progressId: "progress-first", requirementId: "first", status: "accepted" },
      { progressId: "progress-second", requirementId: "second", status: "rejected" },
    ];
    const rejectedAttempt: RequirementHistoryItem = { attemptId, attemptNumber: 1, submissionText: "work", submittedAt: "2026-07-25T00:00:00Z", decision: "rejected", decisionReason: "Add the date." };
    const model = buildEnrollmentProgressReadModel({ enrollmentId: "enrollment", catalogTitle: "Companion", schoolYear: 2026, requirements, progress, attempts: new Map([["progress-second", [rejectedAttempt]]]) });

    expect(model.approvedPercentage).toBe(50);
    expect(model.requirements[1]?.reviewReason).toBe("Add the date.");
    expect(model.requirements[1]?.history).toEqual([rejectedAttempt]);
  });
});
