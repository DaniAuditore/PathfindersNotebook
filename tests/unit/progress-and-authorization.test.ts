import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

import { AuthorizationError, requireClubResourceScope, requireRole } from "@/shared/auth/session";
import { calculateProgress, canCreditRequirement, canTransitionProgress, isReadyForAssessment, type ProgressRecord, type ProgressRequirement } from "@/modules/progress/domain/progress";

const requirements: readonly ProgressRequirement[] = [
  { id: "compound", optional: false, weight: 1, completionRule: "any", allowReuse: false },
  { id: "choice-a", parentRequirementId: "compound", optional: false, weight: 1, allowReuse: false },
  { id: "choice-b", parentRequirementId: "compound", optional: false, weight: 1, allowReuse: false },
  { id: "required", optional: false, weight: 1, allowReuse: false },
  { id: "optional", optional: true, weight: 5, allowReuse: false },
];

function records(...acceptedRequirementIds: string[]): ProgressRecord[] {
  return acceptedRequirementIds.map((requirementId) => ({ requirementId, status: "accepted" }));
}

function authenticatedClientWithRole(role: "CLUB_DIRECTOR" | "INSTRUCTOR" | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: role ? { role } : null, error: null });
  const allowedRoles = vi.fn().mockReturnValue({ maybeSingle });
  const userId = vi.fn().mockReturnValue({ in: allowedRoles });
  const clubId = vi.fn().mockReturnValue({ eq: userId });
  return { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: clubId }) }) };
}

const authenticatedSessionClient = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "actor" } }, error: null }) },
};

describe("progress policies", () => {
  it("permits only the documented submission and review transitions", () => {
    expect(canTransitionProgress("draft", "submitted")).toBe(true);
    expect(canTransitionProgress("submitted", "accepted")).toBe(true);
    expect(canTransitionProgress("submitted", "rejected")).toBe(true);
    expect(canTransitionProgress("rejected", "submitted")).toBe(true);
    expect(canTransitionProgress("accepted", "submitted")).toBe(false);
    expect(canTransitionProgress("draft", "accepted")).toBe(false);
  });

  it("calculates ANY progress deterministically and excludes optional requirements", () => {
    expect(calculateProgress(requirements, records("choice-a"))).toBe(50);
    expect(calculateProgress(requirements, records("choice-a", "required"))).toBe(100);
    expect(isReadyForAssessment(requirements, records("choice-a", "required"))).toBe(true);
  });

  it("refuses duplicate accepted credit unless the target explicitly allows reuse", () => {
    const progress: ProgressRecord[] = [{ requirementId: "other", status: "accepted", acceptedCreditKey: "first-aid" }];
    expect(canCreditRequirement({ id: "target", optional: false, weight: 1, allowReuse: false }, "first-aid", progress)).toBe(false);
    expect(canCreditRequirement({ id: "target", optional: false, weight: 1, allowReuse: true }, "first-aid", progress)).toBe(true);
  });
});

describe("server authorization policies", () => {
  beforeEach(() => createSupabaseServerClient.mockReset());

  it("denies a user whose club membership does not have an allowed role", async () => {
    createSupabaseServerClient
      .mockResolvedValueOnce(authenticatedSessionClient)
      .mockResolvedValueOnce(authenticatedClientWithRole(null));

    await expect(requireRole("club-a", ["CLUB_DIRECTOR"])).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("denies a role-authorized actor when the resource belongs to another club", async () => {
    createSupabaseServerClient
      .mockResolvedValueOnce(authenticatedSessionClient)
      .mockResolvedValueOnce(authenticatedClientWithRole("INSTRUCTOR"));

    await expect(requireClubResourceScope("club-a", ["INSTRUCTOR"], async () => false)).rejects.toThrow("outside this club");
  });
});
