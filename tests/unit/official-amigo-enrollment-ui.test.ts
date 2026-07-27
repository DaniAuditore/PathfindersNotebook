import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
  listEligibleAdminStudents: vi.fn(),
  enrollStudent: vi.fn(),
  writeActionLog: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/shared/auth/session", () => ({ requireSession: mocks.requireSession, requireRole: mocks.requireRole }));
vi.mock("@/modules/enrollment/infrastructure/supabase-official-amigo-enrollment", () => ({
  SupabaseOfficialAmigoEnrollment: class {
    listEligibleAdminStudents = mocks.listEligibleAdminStudents;
    enrollStudent = mocks.enrollStudent;
  },
}));
vi.mock("@/shared/observability/action-log", () => ({ writeActionLog: mocks.writeActionLog }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));

import EnrollmentsPage from "@/app/(protected)/enrollments/page";
import { enrollOfficialAmigoStudentAction } from "@/modules/enrollment/presentation/official-amigo-actions";

const studentId = "20000000-0000-4000-8000-000000000001";
const clubId = "10000000-0000-4000-8000-000000000001";

function studentClient(student: { club_id: string } | null) {
  return {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: student, error: student ? null : { message: "missing" } }),
      };
      return query;
    },
  };
}

describe("official Amigo operational enrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ id: "admin-a" });
  });

  it("renders only server-derived eligible students and accessible learner links", async () => {
    mocks.listEligibleAdminStudents.mockResolvedValue([{ id: clubId, name: "Club A", students: [{ id: studentId, displayName: "Ana" }] }]);

    const html = renderToStaticMarkup(await EnrollmentsPage({ searchParams: Promise.resolve({ message: "Student enrolled in official regular Amigo for this year." }) }));

    expect(html).toContain("Official Amigo enrollment");
    expect(html).toContain("already-provisioned immutable official regular Amigo catalog");
    expect(html).toContain("Ana");
    expect(html).toContain("Enroll in official regular Amigo");
    expect(html).toContain(`href="/students/${studentId}"`);
    expect(html).toContain('role="status"');
  });

  it("renders a student returned as eligible despite withdrawn legacy history", async () => {
    mocks.listEligibleAdminStudents.mockResolvedValue([{ id: clubId, name: "STG Club A", students: [{ id: studentId, displayName: "STG Alumno" }] }]);

    const html = renderToStaticMarkup(await EnrollmentsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("STG Alumno");
    expect(html).toContain("Enroll in official regular Amigo");
    expect(html).not.toContain("No eligible students are available");
  });

  it("does not expose enrollment controls without an eligible server-derived student", async () => {
    mocks.listEligibleAdminStudents.mockResolvedValue([]);

    const html = renderToStaticMarkup(await EnrollmentsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("No eligible students are available");
    expect(html).not.toContain("Enroll in official regular Amigo</button>");
  });

  it("derives the club from the student and re-authorizes before enrollment", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(studentClient({ club_id: clubId }));
    mocks.requireRole.mockResolvedValue({ id: "admin-a" });
    mocks.enrollStudent.mockResolvedValue({ enrollmentId: "enrollment-a", studentId, existing: false });

    await expect(enrollOfficialAmigoStudentAction({ studentId, clubId: "forged-club" })).resolves.toEqual({ enrollmentId: "enrollment-a", studentId, existing: false });
    expect(mocks.requireRole).toHaveBeenCalledWith(clubId, ["admin"]);
    expect(mocks.enrollStudent).toHaveBeenCalledWith(studentId, "admin-a", expect.any(Number));
    expect(mocks.writeActionLog).toHaveBeenCalledWith(expect.objectContaining({ clubId, entityId: "enrollment-a" }));
  });

  it("returns an existing enrollment as stable success without creating a second audit event", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(studentClient({ club_id: clubId }));
    mocks.requireRole.mockResolvedValue({ id: "admin-a" });
    mocks.enrollStudent.mockResolvedValue({ enrollmentId: "enrollment-a", studentId, existing: true });

    await expect(enrollOfficialAmigoStudentAction({ studentId })).resolves.toEqual({ enrollmentId: "enrollment-a", studentId, existing: true });
    expect(mocks.writeActionLog).not.toHaveBeenCalled();
  });

  it("rejects a foreign or missing student before the enrollment boundary", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(studentClient(null));

    await expect(enrollOfficialAmigoStudentAction({ studentId })).rejects.toThrow("Eligible student not found.");
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.enrollStudent).not.toHaveBeenCalled();
  });
});
