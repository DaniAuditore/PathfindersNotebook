import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";

type Result = { data: unknown; error: { message: string } | null };

function clientWith(results: Record<string, Result[]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  return {
    calls,
    client: {
      from(table: string) {
        const result = results[table]?.shift();
        if (!result) throw new Error(`No result queued for ${table}`);
        const query = {
          select: (...args: unknown[]) => { calls.push({ table, method: "select", args }); return query; },
          eq: (...args: unknown[]) => { calls.push({ table, method: "eq", args }); return query; },
          in: (...args: unknown[]) => { calls.push({ table, method: "in", args }); return query; },
          or: (...args: unknown[]) => { calls.push({ table, method: "or", args }); return query; },
          order: (...args: unknown[]) => { calls.push({ table, method: "order", args }); return query; },
          maybeSingle: () => Promise.resolve(result),
          single: () => Promise.resolve(result),
          then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
        };
        return query;
      },
    },
  };
}

describe("Supabase progress read boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives reviewer capability and linked learners from the authenticated actor", async () => {
    const fake = clientWith({
      memberships: [{ data: [{ club_id: "club-a", role: "instructor" }], error: null }],
      students: [{ data: [], error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseProgressReader().dashboard("actor-a")).resolves.toEqual({ learners: [], canReview: true });
    expect(fake.calls).toContainEqual({ table: "memberships", method: "eq", args: ["user_id", "actor-a"] });
    expect(fake.calls).toContainEqual({ table: "memberships", method: "in", args: ["role", ["admin", "instructor"]] });
    expect(fake.calls).toContainEqual({ table: "students", method: "or", args: ["guardian_user_id.eq.actor-a,student_user_id.eq.actor-a"] });
  });

  it("scopes the review queue from server-read memberships, never caller club input", async () => {
    const fake = clientWith({
      memberships: [{ data: [{ club_id: "club-a" }], error: null }],
      enrollments: [{ data: [], error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseProgressReader().reviewQueue("reviewer-a")).resolves.toEqual([]);
    expect(fake.calls).toContainEqual({ table: "memberships", method: "eq", args: ["user_id", "reviewer-a"] });
    expect(fake.calls).toContainEqual({ table: "enrollments", method: "in", args: ["club_id", ["club-a"]] });
    expect(fake.calls).toContainEqual({ table: "enrollments", method: "eq", args: ["status", "active"] });
  });

  it("returns no learner when the RLS-governed student lookup is empty", async () => {
    const fake = clientWith({ students: [{ data: null, error: null }] });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseProgressReader().learner("foreign-student")).resolves.toBeNull();
    expect(fake.calls).toContainEqual({ table: "students", method: "eq", args: ["id", "foreign-student"] });
  });
});
