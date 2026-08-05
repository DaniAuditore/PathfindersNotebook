import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("server-only", () => ({}));

import { memberOperationFormAction } from "@/modules/clubs/presentation/member-actions";

describe("member operation action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a committed unit operation successful when redirect signals navigation", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("operation", "unit");
    form.set("clubId", "91000000-0000-4000-8000-000000000001");
    form.set("name", "Unidad de prueba");

    await expect(memberOperationFormAction(form)).rejects.toThrow("REDIRECT:/members?message=operation");
    expect(rpc).toHaveBeenCalledWith("create_unit", {
      target_club_id: "91000000-0000-4000-8000-000000000001",
      name_input: "Unidad de prueba",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/members");
    expect(mocks.redirect).not.toHaveBeenCalledWith("/members?error=operation");
  });
});
