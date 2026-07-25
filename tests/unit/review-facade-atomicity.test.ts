import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

import { SupabaseReviewFacade } from "@/modules/review/infrastructure/supabase-review-facade";

const progressId = "11111111-1111-4111-8111-111111111111";

describe("Supabase review mutation boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves enrollment scope before the committing submission RPC and performs no post-commit query", async () => {
    const events: string[] = [];
    const single = vi.fn(async () => { events.push("scope"); return { data: { enrollment_id: "enrollment-a" }, error: null }; });
    const query = { select: () => query, eq: () => query, single };
    const rpc = vi.fn(async () => { events.push("rpc"); return { data: "attempt-a", error: null }; });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query), rpc });

    await expect(new SupabaseReviewFacade().submit({ progressId, actorId: "guardian-a", submissionText: "Done", evidenceIds: [] }))
      .resolves.toEqual({ attemptId: "attempt-a", enrollmentId: "enrollment-a" });

    expect(events).toEqual(["scope", "rpc"]);
    expect(single).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("does not invoke the mutation RPC when pre-mutation scope resolution fails", async () => {
    const query = { select: () => query, eq: () => query, single: vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } }) };
    const rpc = vi.fn();
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query), rpc });

    await expect(new SupabaseReviewFacade().submit({ progressId, actorId: "guardian-a", submissionText: "Done", evidenceIds: [] }))
      .rejects.toThrow("Unable to resolve the progress being submitted.");
    expect(rpc).not.toHaveBeenCalled();
  });
});
