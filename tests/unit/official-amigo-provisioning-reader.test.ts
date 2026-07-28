import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

import { SupabaseOfficialProvisioningReader } from "@/modules/catalog/infrastructure/supabase-official-provisioning-reader";

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
          is: (...args: unknown[]) => { calls.push({ table, method: "is", args }); return query; },
          in: (...args: unknown[]) => { calls.push({ table, method: "in", args }); return query; },
          order: (...args: unknown[]) => { calls.push({ table, method: "order", args }); return query; },
          maybeSingle: () => Promise.resolve(result),
          then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
        };
        return query;
      },
    },
  };
}

describe("official Amigo provisioning reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives eligible clubs from the actor's RLS-visible canonical director assignments", async () => {
    const fake = clientWith({
      role_assignments: [{ data: [{ club_id: "club-a" }], error: null }],
      clubs: [{ data: [{ id: "club-a", name: "Club A" }], error: null }],
      catalogs: [{ data: null, error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialProvisioningReader().listAdminClubs("actor-a"))
      .resolves.toEqual([{ id: "club-a", name: "Club A", catalog: null }]);
    expect(fake.calls).toContainEqual({ table: "role_assignments", method: "eq", args: ["user_id", "actor-a"] });
    expect(fake.calls).toContainEqual({ table: "role_assignments", method: "eq", args: ["role", "CLUB_DIRECTOR"] });
    expect(fake.calls).toContainEqual({ table: "role_assignments", method: "is", args: ["revoked_at", null] });
    expect(fake.calls.some((call) => call.table === "memberships")).toBe(false);
    expect(fake.calls).toContainEqual({ table: "clubs", method: "in", args: ["id", ["club-a"]] });
  });

  it("does not query clubs when the actor has no canonical director assignment", async () => {
    const fake = clientWith({ role_assignments: [{ data: [], error: null }] });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialProvisioningReader().listAdminClubs("actor-a")).resolves.toEqual([]);
    expect(fake.calls.some((call) => call.table === "clubs")).toBe(false);
  });
});
