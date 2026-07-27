import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

import { SupabaseOfficialAmigoEnrollment } from "@/modules/enrollment/infrastructure/supabase-official-amigo-enrollment";

type Result = { data: unknown; error: { message: string } | null; count?: number | null };
const studentId = "20000000-0000-4000-8000-000000000001";

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
          order: (...args: unknown[]) => { calls.push({ table, method: "order", args }); return query; },
          insert: (...args: unknown[]) => { calls.push({ table, method: "insert", args }); return query; },
          maybeSingle: () => Promise.resolve(result),
          single: () => Promise.resolve(result),
          then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
        };
        return query;
      },
    },
  };
}

describe("official Amigo enrollment boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives the canonical catalog/version and initializes all 121 progress rows", async () => {
    const fake = clientWith({
      students: [{ data: { id: studentId, club_id: "club-a", display_name: "Ana" }, error: null }],
      catalogs: [{ data: { id: "catalog-a" }, error: null }],
      catalog_versions: [{ data: { id: "version-a" }, error: null }],
      requirements: [{ data: Array.from({ length: 121 }, (_, index) => ({ id: String(index), parent_requirement_id: index < 25 ? null : "parent" })), error: null }],
      enrollments: [{ data: null, error: null }, { data: { id: "enrollment-a" }, error: null }],
      requirement_progress: [{ data: null, error: null, count: 121 }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialAmigoEnrollment().enrollStudent(studentId, "admin-a", 2026))
      .resolves.toEqual({ enrollmentId: "enrollment-a", studentId, existing: false });
    expect(fake.calls).toContainEqual({ table: "catalogs", method: "eq", args: ["source_catalog_code", "amigo.regular"] });
    expect(fake.calls).toContainEqual({ table: "catalog_versions", method: "eq", args: ["source_revision_key", "dsa-amigo-official-card-es-undated"] });
    expect(fake.calls).toContainEqual({ table: "enrollments", method: "insert", args: [expect.objectContaining({ catalog_id: "catalog-a", catalog_version_id: "version-a", club_id: "club-a" })] });
  });

  it("returns the existing enrollment without inserting another row", async () => {
    const fake = clientWith({
      students: [{ data: { id: studentId, club_id: "club-a", display_name: "Ana" }, error: null }],
      catalogs: [{ data: { id: "catalog-a" }, error: null }],
      catalog_versions: [{ data: { id: "version-a" }, error: null }],
      requirements: [{ data: Array.from({ length: 121 }, (_, index) => ({ id: String(index), parent_requirement_id: index < 25 ? null : "parent" })), error: null }],
      enrollments: [{ data: { id: "enrollment-a" }, error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialAmigoEnrollment().enrollStudent(studentId, "admin-a", 2026))
      .resolves.toEqual({ enrollmentId: "enrollment-a", studentId, existing: true });
    expect(fake.calls.some((call) => call.table === "enrollments" && call.method === "insert")).toBe(false);
  });

  it("finds the provisioned catalog and keeps a student eligible when only a withdrawn legacy enrollment exists", async () => {
    const fake = clientWith({
      memberships: [{ data: [{ club_id: "club-a" }], error: null }],
      clubs: [{ data: [{ id: "club-a", name: "Club A" }], error: null }],
      catalogs: [{ data: { id: "official-catalog-a" }, error: null }],
      catalog_versions: [{ data: { id: "official-version-a" }, error: null }],
      students: [{ data: [{ id: studentId, club_id: "club-a", display_name: "Ana" }], error: null }],
      enrollments: [{ data: [], error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialAmigoEnrollment().listEligibleAdminStudents("admin-a", 2026))
      .resolves.toEqual([{ id: "club-a", name: "Club A", students: [{ id: studentId, displayName: "Ana" }] }]);
    expect(fake.calls).toContainEqual({ table: "catalogs", method: "eq", args: ["source_catalog_code", "amigo.regular"] });
    expect(fake.calls).toContainEqual({ table: "enrollments", method: "eq", args: ["status", "active"] });
  });
});
