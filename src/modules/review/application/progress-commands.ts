import { z } from "zod";

export const textSubmissionSchema = z.object({
  progressId: z.uuid(),
  submissionText: z.string().trim().min(1, "Submission text is required.").max(10_000),
});

export const progressReviewSchema = z.object({
  progressId: z.uuid(),
  attemptId: z.uuid(),
  decision: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().max(2_000).optional(),
}).superRefine((command, context) => {
  if (command.decision === "rejected" && !command.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required when requesting changes." });
  }
});
