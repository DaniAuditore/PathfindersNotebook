import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  requireSession: vi.fn(),
  requireRole: vi.fn(),
  submit: vi.fn(),
  review: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/shared/auth/session", () => ({ requireSession: mocks.requireSession, requireRole: mocks.requireRole }));
vi.mock("@/modules/review/infrastructure/supabase-review-facade", () => ({
  SupabaseReviewFacade: class { submit = mocks.submit; review = mocks.review; reverse = vi.fn(); },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { reviewProgressAction, submitProgressAction } from "@/modules/review/presentation/actions";

const progressId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";

function queryClient(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        single: () => Promise.resolve({ data: rows[table] ?? null, error: rows[table] ? null : { message: "not found" } }),
      };
      return query;
    },
  };
}

describe("progress server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ id: "guardian-a" });
    mocks.requireRole.mockResolvedValue({ id: "instructor-a" });
  });

  it("pre-resolves render scope, submits once, and revalidates affected learner views", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(queryClient({
      requirement_progress: { enrollment_id: "enrollment-a", requirement_id: "requirement-a" },
      enrollments: { student_id: "student-a" },
      requirements: { parent_requirement_id: null, progress_mode: "direct", completion_semantics: "direct", modalities: ["reading"], requires_evidence: false },
    }));
    mocks.submit.mockResolvedValue({ attemptId, enrollmentId: "enrollment-a" });

    await expect(submitProgressAction({ progressId, submissionText: "  completed  " })).resolves.toEqual({ attemptId, enrollmentId: "enrollment-a" });
    expect(mocks.submit).toHaveBeenCalledWith({ progressId, submissionText: "completed", actorId: "guardian-a", evidenceIds: [] });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/students/student-a");
  });

  it("rejects compound, practical, or evidence-required text commands before the mutation RPC", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(queryClient({
      requirement_progress: { enrollment_id: "enrollment-a", requirement_id: "requirement-a" },
      enrollments: { student_id: "student-a" },
      requirements: { parent_requirement_id: null, progress_mode: "derived", completion_semantics: "all_children", modalities: ["practical_in_person"], requires_evidence: true },
    }));

    await expect(submitProgressAction({ progressId, submissionText: "Done" })).rejects.toThrow("cannot be submitted as text");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("denies a foreign-club review before invoking the mutation RPC", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(queryClient({
      requirement_progress: { enrollment_id: "enrollment-b" },
      enrollments: { club_id: "club-b", student_id: "student-b" },
    }));
    mocks.requireRole.mockRejectedValue(new Error("not authorized"));

    await expect(reviewProgressAction({ progressId, attemptId, decision: "accepted" })).rejects.toThrow("not authorized");
    expect(mocks.requireRole).toHaveBeenCalledWith("club-b", ["admin", "instructor"]);
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it("reviews through the derived club and revalidates queue and learner views", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(queryClient({
      requirement_progress: { enrollment_id: "enrollment-a" },
      enrollments: { club_id: "club-a", student_id: "student-a" },
    }));
    mocks.review.mockResolvedValue({ enrollmentId: "enrollment-a" });

    await expect(reviewProgressAction({ progressId, attemptId, decision: "rejected", reason: "  Add date  " })).resolves.toEqual({ enrollmentId: "enrollment-a" });
    expect(mocks.review).toHaveBeenCalledWith({ progressId, attemptId, decision: "rejected", reason: "Add date", actorId: "instructor-a" });
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual(["/dashboard", "/reviews", "/students/student-a"]);
  });
});
