import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/shared/auth/session", () => ({ requireRole: mocks.requireRole }));

import { recordAssessmentAction, recordInvestitureAction } from "@/modules/assessment/presentation/actions";
import { canRecordInvestiture } from "@/modules/assessment/application/assessment-read-model";

const enrollmentId = "11111111-1111-4111-8111-111111111111";
const clubA = "22222222-2222-4222-8222-222222222222";
const clubB = "33333333-3333-4333-8333-333333333333";

function clientFor(clubId: string) {
  return {
    from: vi.fn(() => {
      const query = { select: () => query, eq: () => query, maybeSingle: () => Promise.resolve({ data: { club_id: clubId }, error: null }) };
      return query;
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe("límites de acciones de evaluación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resuelve el club de la inscripción antes de invocar el RPC", async () => {
    const client = clientFor(clubA);
    mocks.client.mockResolvedValue(client);

    await recordAssessmentAction({ clubId: clubA, enrollmentId, decision: "passed", comments: "Correcto" });

    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("record_assessment", { target_enrollment_id: enrollmentId, decision_input: "passed", comments_input: "Correcto" });
  });

  it("no permite que el club oculto del formulario cambie el alcance de investidura", async () => {
    const client = clientFor(clubA);
    mocks.client.mockResolvedValue(client);

    await expect(recordInvestitureAction({ clubId: clubB, enrollmentId, rationale: "Cumplió los requisitos" })).rejects.toThrow("no está disponible");
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("muestra la confirmación de investidura sólo para la dirección canónica del club correspondiente", () => {
    const assignments = [
      { clubId: clubA, role: "INSTRUCTOR" as const },
      { clubId: clubB, role: "CLUB_DIRECTOR" as const },
    ];

    expect(canRecordInvestiture(assignments, clubA)).toBe(false);
    expect(canRecordInvestiture(assignments, clubB)).toBe(true);
  });
});
