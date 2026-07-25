import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  learner: vi.fn(),
  reviewQueue: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/modules/progress/infrastructure/supabase-progress-reader", () => ({
  SupabaseProgressReader: class { dashboard = mocks.dashboard; learner = mocks.learner; reviewQueue = mocks.reviewQueue; },
}));
vi.mock("@/modules/review/presentation/actions", () => ({ submitProgressFormAction: vi.fn(), reviewProgressFormAction: vi.fn() }));

import DashboardPage from "@/app/(protected)/dashboard/page";
import ReviewsPage from "@/app/(protected)/reviews/page";
import StudentPage from "@/app/(protected)/students/[studentId]/page";

describe("UX progress rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ id: "actor-a" });
  });

  it("renders linked progress and the server-derived reviewer queue link", async () => {
    mocks.dashboard.mockResolvedValue({
      canReview: true,
      learners: [{ studentId: "student-a", displayName: "Learner A", enrollments: [{ enrollmentId: "enrollment-a", catalogTitle: "Companion", schoolYear: 2026, approvedPercentage: 50, requirements: [] }] }],
    });

    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ error: "Sign out failed. You are still signed in. Please try again." }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Sign out failed. You are still signed in. Please try again.");
    expect(html).toContain("Open submitted-attempt review queue");
    expect(html).toContain("Learner A");
    expect(html).toContain("50% approved");
  });

  it("renders rejection history and a resubmission form only for text work", async () => {
    mocks.learner.mockResolvedValue({
      studentId: "student-a",
      displayName: "Learner A",
      enrollments: [{
        enrollmentId: "enrollment-a", catalogTitle: "Companion", schoolYear: 2026, approvedPercentage: 0,
        requirements: [{ progressId: "progress-a", requirementId: "requirement-a", title: "Reading", instructions: "Read", requirementType: "text", requiresEvidence: false, status: "rejected", reviewReason: "Add the date.", history: [{ attemptId: "attempt-a", attemptNumber: 1, submissionText: "Done", submittedAt: "2026-07-25", decision: "rejected", decisionReason: "Add the date." }] }],
      }],
    });

    const html = renderToStaticMarkup(await StudentPage({ params: Promise.resolve({ studentId: "student-a" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Changes requested");
    expect(html).toContain("Review reason:");
    expect(html).toContain("Add the date.");
    expect(html).toContain("Resubmit");
  });

  it("renders approve and required request-changes controls for submitted work", async () => {
    mocks.reviewQueue.mockResolvedValue([{ progressId: "progress-a", attemptId: "attempt-a", studentName: "Learner A", requirementTitle: "Reading", submissionText: "Done", submittedAt: "2026-07-25" }]);

    const html = renderToStaticMarkup(await ReviewsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Approve");
    expect(html).toContain("Request changes");
    expect(html).toContain("required");
  });
});
