import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
  listAdminClubs: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/shared/auth/session", () => ({
  requireSession: mocks.requireSession,
  requireRole: mocks.requireRole,
}));
vi.mock("@/modules/catalog/infrastructure/supabase-official-provisioning-reader", () => ({
  SupabaseOfficialProvisioningReader: class { listAdminClubs = mocks.listAdminClubs; },
}));
vi.mock("@/modules/catalog/application/provision-official-catalog", () => ({
  ProvisionOfficialCatalog: class { execute = mocks.execute; },
}));
vi.mock("@/modules/catalog/infrastructure/supabase-catalog-facade", () => ({
  SupabaseCatalogFacade: class {},
}));
vi.mock("@/shared/observability/action-log", () => ({ writeActionLog: vi.fn() }));

import ClassesPage from "@/app/(protected)/classes/page";
import { provisionOfficialAmigoAction } from "@/modules/catalog/presentation/actions";

const clubId = "10000000-0000-4000-8000-000000000001";

describe("official Amigo operational provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ id: "actor-a" });
  });

  it("renders only server-derived administrator clubs with stable operational guidance", async () => {
    mocks.listAdminClubs.mockResolvedValue([{ id: clubId, name: "Club A" }]);

    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve({ message: "Official regular Amigo is ready for this club." }) }));

    expect(html).toContain("Preparación oficial de Amigo");
    expect(html).toContain("catálogo oficial regular e inmutable de Amigo");
    expect(html).toContain("Club A");
    expect(html).toContain("Preparar Amigo regular oficial");
    expect(html).toContain('role="status"');
    expect(html).toContain('href="/dashboard"');
  });

  it("does not render a provisioning control when the actor has no administrator club", async () => {
    mocks.listAdminClubs.mockResolvedValue([]);

    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Necesitás una membresía de administrador");
    expect(html).not.toContain("Preparar Amigo regular oficial</button>");
  });

  it("re-authorizes the submitted club on the server before invoking the canonical provision use case", async () => {
    mocks.requireRole.mockResolvedValue({ id: "actor-a" });
    mocks.execute.mockResolvedValue({ ok: true, value: { catalogId: "catalog-a", versionId: "version-a", versionNumber: 1 } });

    await expect(provisionOfficialAmigoAction({ clubId })).resolves.toEqual({
      ok: true,
      value: { catalogId: "catalog-a", versionId: "version-a", versionNumber: 1 },
    });
    expect(mocks.requireRole).toHaveBeenCalledWith(clubId, ["CLUB_DIRECTOR"]);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ clubId }));
  });

  it("rejects a forged club selection before the use case runs", async () => {
    mocks.requireRole.mockRejectedValue(new Error("denied"));

    await expect(provisionOfficialAmigoAction({ clubId })).rejects.toThrow("denied");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
