import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

import { SupabaseMemberOperationsReader } from "@/modules/clubs/infrastructure/supabase-member-operations-reader";

type Result = { data: unknown; error: { message: string } | null };

function clientWith(results: Record<string, Result[]>, conditions: Record<string, "LEADER" | "PATHFINDER">) {
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
          is: (...args: unknown[]) => { calls.push({ table, method: "is", args }); return query; },
          order: (...args: unknown[]) => { calls.push({ table, method: "order", args }); return query; },
          then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
        };
        return query;
      },
      rpc(name: string, args?: { target_member_id: string }) {
        calls.push({ table: "rpc", method: name, args: [args] });
        if (name === "list_club_rotation_metadata") return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: conditions[args!.target_member_id], error: null });
      },
    },
  };
}

describe("Supabase member operations reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("projects each displayed condition from the database authority rather than server calendar years", async () => {
    const fake = clientWith({
      club_members: [
        { data: [{ id: "director", club_id: "club-a", full_name: "Director", lifecycle: "ACTIVE" }], error: null },
        { data: [
          { id: "member-before-midnight", club_id: "club-a", full_name: "Before midnight", lifecycle: "ACTIVE" },
          { id: "member-at-midnight", club_id: "club-a", full_name: "At midnight", lifecycle: "ACTIVE" },
        ], error: null },
      ],
      club_director_assignments: [{ data: [{ club_id: "club-a" }], error: null }],
      clubs: [{ data: [{ id: "club-a", name: "Club A" }], error: null }],
      units: [{ data: [], error: null }],
      staff_unit_assignments: [{ data: [], error: null }],
    }, { "member-before-midnight": "PATHFINDER", "member-at-midnight": "LEADER" });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseMemberOperationsReader().forActor("actor-a")).resolves.toMatchObject({
      directed: [{
        members: [
          { id: "member-before-midnight", condition: "PATHFINDER" },
          { id: "member-at-midnight", condition: "LEADER" },
        ],
      }],
    });
    expect(fake.calls).toContainEqual({ table: "rpc", method: "member_condition_at", args: [{ target_member_id: "member-before-midnight" }] });
    expect(fake.calls).toContainEqual({ table: "rpc", method: "member_condition_at", args: [{ target_member_id: "member-at-midnight" }] });
  });
});
