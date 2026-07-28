import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  learner: vi.fn(),
  reviewQueue: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/modules/progress/infrastructure/supabase-progress-reader", () => ({
  SupabaseProgressReader: class { dashboard = mocks.dashboard; learner = mocks.learner; reviewQueue = mocks.reviewQueue; },
}));
vi.mock("@/modules/review/presentation/actions", () => ({ submitProgressFormAction: vi.fn(), reviewProgressFormAction: vi.fn() }));

import DashboardPage from "@/app/(protected)/dashboard/page";
import ReviewsPage from "@/app/(protected)/reviews/page";
import StudentPage from "@/app/(protected)/students/[studentId]/page";

describe("UX progress rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ id: "actor-a" });
  });

  it("renders linked progress and the server-derived reviewer queue link", async () => {
    mocks.dashboard.mockResolvedValue({
      canReview: true,
      learners: [{ studentId: "student-a", displayName: "Learner A", enrollments: [{ enrollmentId: "enrollment-a", catalogTitle: "Companion", schoolYear: 2026, approvedPercentage: 50, requirements: [] }] }],
    });

    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ error: "Sign out failed. You are still signed in. Please try again." }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("No fue posible completar la acción. Inténtalo de nuevo.");
    expect(html).toContain("Abrir cola de revisiones");
    expect(html).toContain("Learner A");
    expect(html).toContain("50% aprobado");
  });

  it("renders rejection history and a resubmission form only for text work", async () => {
    mocks.learner.mockResolvedValue({
      studentId: "student-a",
      displayName: "Learner A",
      enrollments: [{
        enrollmentId: "enrollment-a", catalogTitle: "Companion", schoolYear: 2026, approvedPercentage: 0,
        requirements: [{ progressId: "progress-a", requirementId: "requirement-a", title: "Reading", instructions: "Read", requirementType: "text", requiresEvidence: false, status: "rejected", reviewReason: "Add the date.", history: [{ attemptId: "attempt-a", attemptNumber: 1, submissionText: "Done", submittedAt: "2026-07-25", decision: "rejected", decisionReason: "Add the date." }] }],
      }],
    });

    const html = renderToStaticMarkup(await StudentPage({ params: Promise.resolve({ studentId: "student-a" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Cambios solicitados");
    expect(html).toContain("Motivo de revisión:");
    expect(html).toContain("Add the date.");
    expect(html).toContain("Reenviar para revisión");
  });

  it("renders sectioned compound requirements without a direct text form", async () => {
    mocks.learner.mockResolvedValue({
      studentId: "student-a", displayName: "Learner A", enrollments: [{
        enrollmentId: "enrollment-a", catalogTitle: "Amigo", schoolYear: 2026, approvedPercentage: 0, requirements: [],
        sections: [{ sectionId: "section-a", title: "Generales", position: 0, approvedPercentage: 0, requirements: [{ progressId: "root-progress", requirementId: "root", title: "Bible checklist", instructions: "", requirementType: "compound", requiresEvidence: false, status: "draft", reviewReason: null, history: [], modalities: ["reading"], completionSemantics: "all_children", childRole: null, complete: false, canSubmitText: false, children: [{ progressId: "child-progress", requirementId: "child", title: "Genesis 1", instructions: "", requirementType: "text", requiresEvidence: false, status: "draft", reviewReason: null, history: [], modalities: ["reading"], completionSemantics: "direct", childRole: "checklist_item", complete: false, canSubmitText: false, children: [] }] }] }],
      }],
    });

    const html = renderToStaticMarkup(await StudentPage({ params: Promise.resolve({ studentId: "student-a" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Generales");
    expect(html).toContain("0% aprobado");
    expect(html).toContain("Se completa a partir de sus elementos: incompleto");
    expect(html).toContain("Genesis 1");
    expect(html).not.toContain("Enviar para revisión");
  });

  it("renders a child review attempt with its root Part of context", async () => {
    mocks.reviewQueue.mockResolvedValue([{
      progressId: "progress-a",
      attemptId: "attempt-a",
      studentName: "Learner A",
      requirementTitle: "Genesis 1",
      rootRequirementTitle: "Bible checklist",
      childContext: "Part of: Bible checklist",
      submissionText: "Done",
      submittedAt: "2026-07-25",
    }]);

    const html = renderToStaticMarkup(await ReviewsPage({ searchParams: Promise.resolve({ message: "Revisión guardada." }) }));
    expect(html).toContain("Learner A: Genesis 1");
    expect(html).toContain("Part of: Bible checklist");
    expect(html).toContain("Aprobar entrega");
    expect(html).toContain("Solicitar cambios");
    expect(html).toContain('class="review-decision review-decision--approve"');
    expect(html).toContain('class="review-decision review-decision--changes"');
    expect(html).toContain('class="button--request-changes"');
    expect(html).toContain('value="accepted" type="submit" aria-busy="false" name="decision"');
    expect(html).toContain('value="rejected" type="submit" aria-busy="false" name="decision"');
    expect(html).toContain("Confirme que la entrega cumple el requisito antes de aprobarla.");
    expect(html).toContain("Indique el motivo para que el alumno pueda corregir la entrega.");
    expect(html).toContain("required");
    expect(html).toContain('role="status"');
    expect(html).toContain('tabindex="-1"');
  });

  it("uses neutral guidance when showing the next pending requirement", async () => {
    mocks.learner.mockResolvedValue({
      studentId: "student-a", displayName: "Learner A", enrollments: [{
        enrollmentId: "enrollment-a", catalogTitle: "Amigo", schoolYear: 2026, approvedPercentage: 0, requirements: [],
      }],
    });

    const html = renderToStaticMarkup(await StudentPage({ params: Promise.resolve({ studentId: "student-a" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Abra una sección para consultar el próximo requisito pendiente.");
  });
});
