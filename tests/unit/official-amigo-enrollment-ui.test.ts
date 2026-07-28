import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
  listEligibleAdminStudents: vi.fn(),
  enrollStudent: vi.fn(),
    writeActionLog: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
}));

vi.mock("@/shared/auth/session", () => ({ requireSession: mocks.requireSession, requireRole: mocks.requireRole }));
vi.mock("@/modules/enrollment/infrastructure/supabase-official-amigo-enrollment", () => ({
  OfficialAmigoEnrollmentFailure: class extends Error {},
  SupabaseOfficialAmigoEnrollment: class {
    listEligibleAdminStudents = mocks.listEligibleAdminStudents;
    enrollStudent = mocks.enrollStudent;
  },
}));
vi.mock("@/shared/observability/action-log", () => ({ writeActionLog: mocks.writeActionLog }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import EnrollmentsPage from "@/app/(protected)/enrollments/page";
import { enrollOfficialAmigoStudentAction, enrollOfficialAmigoStudentFormAction } from "@/modules/enrollment/presentation/official-amigo-actions";

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
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
  });

  it("renders only server-derived eligible students and accessible learner links", async () => {
    mocks.listEligibleAdminStudents.mockResolvedValue([{ id: clubId, name: "Club A", students: [{ id: studentId, displayName: "Ana" }] }]);

    const html = renderToStaticMarkup(await EnrollmentsPage({ searchParams: Promise.resolve({ message: "Student enrolled in official regular Amigo for this year." }) }));

    expect(html).toContain("Inscripción oficial de Amigo");
    expect(html).toContain("catálogo oficial regular de Amigo preparado");
    expect(html).toContain("Ana");
    expect(html).toContain("Inscribir en Amigo regular oficial");
    expect(html).toContain(`href="/students/${studentId}"`);
    expect(html).toContain('role="status"');
  });

  it("renders a student returned as eligible despite withdrawn legacy history", async () => {
    mocks.listEligibleAdminStudents.mockResolvedValue([{ id: clubId, name: "STG Club A", students: [{ id: studentId, displayName: "STG Alumno" }] }]);

    const html = renderToStaticMarkup(await EnrollmentsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("STG Alumno");
    expect(html).toContain("Inscribir en Amigo regular oficial");
    expect(html).not.toContain("No hay alumnos elegibles");
  });

  it("does not expose enrollment controls without an eligible server-derived student", async () => {
    mocks.listEligibleAdminStudents.mockResolvedValue([]);

    const html = renderToStaticMarkup(await EnrollmentsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("No hay alumnos elegibles");
    expect(html).not.toContain("Inscribir en Amigo regular oficial</button>");
  });

  it("derives the club from the student and re-authorizes before enrollment", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(studentClient({ club_id: clubId }));
    mocks.requireRole.mockResolvedValue({ id: "admin-a" });
    mocks.enrollStudent.mockResolvedValue({ enrollmentId: "enrollment-a", studentId, existing: false });

    await expect(enrollOfficialAmigoStudentAction({ studentId, clubId: "forged-club" })).resolves.toEqual({ enrollmentId: "enrollment-a", studentId, existing: false });
    expect(mocks.requireRole).toHaveBeenCalledWith(clubId, ["CLUB_DIRECTOR"]);
    expect(mocks.enrollStudent).toHaveBeenCalledWith(studentId, expect.any(Number));
    expect(mocks.writeActionLog).not.toHaveBeenCalled();
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

  it("redirects with the generic safe error and emits only redacted structured diagnostics", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(studentClient({ club_id: clubId }));
    mocks.requireRole.mockResolvedValue({ id: "admin-a" });
    mocks.enrollStudent.mockRejectedValue(new Error("database payload with token=secret and STG Alumno"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const form = new FormData();
    form.set("studentId", studentId);

    await expect(enrollOfficialAmigoStudentFormAction(form)).rejects.toThrow("redirect");

    expect(mocks.redirect).toHaveBeenCalledWith("/enrollments?error=No%20fue%20posible%20completar%20la%20inscripci%C3%B3n%20oficial%20de%20Amigo.");
    expect(errorSpy).toHaveBeenCalledWith({
      event: "official_amigo_enrollment_failed",
      code: "official_amigo_enrollment_unexpected",
      context: {},
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret");
    errorSpy.mockRestore();
  });
});
