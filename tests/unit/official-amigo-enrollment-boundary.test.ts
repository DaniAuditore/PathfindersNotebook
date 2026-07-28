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
      rpc(name: string, args: unknown) {
        calls.push({ table: name, method: "rpc", args: [args] });
        const result = results[name]?.shift();
        if (!result) throw new Error(`No result queued for RPC ${name}`);
        return Promise.resolve(result);
      },
      from(table: string) {
        const result = results[table]?.shift();
        if (!result) throw new Error(`No result queued for ${table}`);
        const query = {
          select: (...args: unknown[]) => { calls.push({ table, method: "select", args }); return query; },
          eq: (...args: unknown[]) => { calls.push({ table, method: "eq", args }); return query; },
          is: (...args: unknown[]) => { calls.push({ table, method: "is", args }); return query; },
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
      enroll_official_amigo_student: [{ data: { enrollmentId: "enrollment-a", existing: false }, error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialAmigoEnrollment().enrollStudent(studentId, 2026))
      .resolves.toEqual({ enrollmentId: "enrollment-a", studentId, existing: false });
    expect(fake.calls).toContainEqual({ table: "catalogs", method: "eq", args: ["source_catalog_code", "amigo.regular"] });
    expect(fake.calls).toContainEqual({ table: "catalog_versions", method: "eq", args: ["source_revision_key", "dsa-amigo-official-card-es-undated"] });
    expect(fake.calls).toContainEqual({ table: "enroll_official_amigo_student", method: "rpc", args: [{ target_student_id: studentId, target_school_year: 2026 }] });
  });

  it("returns the existing enrollment without inserting another row", async () => {
    const fake = clientWith({
      students: [{ data: { id: studentId, club_id: "club-a", display_name: "Ana" }, error: null }],
      catalogs: [{ data: { id: "catalog-a" }, error: null }],
      catalog_versions: [{ data: { id: "version-a" }, error: null }],
      requirements: [{ data: Array.from({ length: 121 }, (_, index) => ({ id: String(index), parent_requirement_id: index < 25 ? null : "parent" })), error: null }],
      enroll_official_amigo_student: [{ data: { enrollmentId: "enrollment-a", existing: true }, error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialAmigoEnrollment().enrollStudent(studentId, 2026))
      .resolves.toEqual({ enrollmentId: "enrollment-a", studentId, existing: true });
    expect(fake.calls).toContainEqual({ table: "enroll_official_amigo_student", method: "rpc", args: [{ target_student_id: studentId, target_school_year: 2026 }] });
  });

  it("finds the provisioned catalog for a canonical-only director and keeps a student eligible when only a withdrawn legacy enrollment exists", async () => {
    const fake = clientWith({
      role_assignments: [{ data: [{ club_id: "club-a" }], error: null }],
      clubs: [{ data: [{ id: "club-a", name: "Club A" }], error: null }],
      catalogs: [{ data: { id: "official-catalog-a" }, error: null }],
      catalog_versions: [{ data: { id: "official-version-a" }, error: null }],
      students: [{ data: [{ id: studentId, club_id: "club-a", display_name: "Ana" }], error: null }],
      enrollments: [{ data: [], error: null }],
    });
    createSupabaseServerClient.mockResolvedValue(fake.client);

    await expect(new SupabaseOfficialAmigoEnrollment().listEligibleAdminStudents("admin-a", 2026))
      .resolves.toEqual([{ id: "club-a", name: "Club A", students: [{ id: studentId, displayName: "Ana" }] }]);
    expect(fake.calls).toContainEqual({ table: "role_assignments", method: "eq", args: ["user_id", "admin-a"] });
    expect(fake.calls).toContainEqual({ table: "role_assignments", method: "eq", args: ["role", "CLUB_DIRECTOR"] });
    expect(fake.calls).toContainEqual({ table: "role_assignments", method: "is", args: ["revoked_at", null] });
    expect(fake.calls.some((call) => call.table === "memberships")).toBe(false);
    expect(fake.calls).toContainEqual({ table: "catalogs", method: "eq", args: ["source_catalog_code", "amigo.regular"] });
    expect(fake.calls).toContainEqual({ table: "enrollments", method: "eq", args: ["status", "active"] });
  });
});
