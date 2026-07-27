import { beforeEach, describe, expect, it, vi } from "vitest";

import amigoRegularSnapshot from "@/modules/catalog/infrastructure/official/amigo-regular.es.json";
import { ProvisionOfficialCatalog } from "@/modules/catalog/application/provision-official-catalog";
import type { ProvisionOfficialCatalogPort } from "@/modules/catalog/application/catalog-facade";
import { validateOfficialRegularAmigoSnapshot } from "@/modules/catalog/domain/official-template";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

import { SupabaseCatalogFacade } from "@/modules/catalog/infrastructure/supabase-catalog-facade";

const clubId = "10000000-0000-4000-8000-000000000001";
const published = {
  catalogId: "20000000-0000-4000-8000-000000000001",
  versionId: "30000000-0000-4000-8000-000000000001",
  versionNumber: 1,
};
const officialValidation = validateOfficialRegularAmigoSnapshot(amigoRegularSnapshot);
if (!officialValidation.ok) throw new Error("Canonical test snapshot must pass AC4 validation.");
const validatedSnapshot = officialValidation.value;

describe("ProvisionOfficialCatalog use case", () => {
  it("passes only the AC4-validated snapshot to the provisioning port", async () => {
    const port: ProvisionOfficialCatalogPort = {
      provisionOfficial: vi.fn().mockResolvedValue({ ok: true, value: published }),
    };

    await expect(new ProvisionOfficialCatalog(port).execute({ clubId, snapshot: amigoRegularSnapshot }))
      .resolves.toEqual({ ok: true, value: published });
    expect(port.provisionOfficial).toHaveBeenCalledWith(clubId, amigoRegularSnapshot);
  });

  it("returns actionable validation errors and never crosses the port on canonical drift", async () => {
    const port: ProvisionOfficialCatalogPort = { provisionOfficial: vi.fn() };
    const drifted = structuredClone(amigoRegularSnapshot);
    drifted.requirements[0].title = "Drifted title";

    const result = await new ProvisionOfficialCatalog(port).execute({ clubId, snapshot: drifted });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("official_snapshot_invalid");
      expect(result.error.details).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "canonical_drift", path: expect.stringContaining("amigo.reg.s01.r01") }),
      ]));
    }
    expect(port.provisionOfficial).not.toHaveBeenCalled();
  });
});

describe("Supabase official-catalog adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one RPC and maps first publication without exposing a service-role client", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: published, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await expect(new SupabaseCatalogFacade().provisionOfficial(clubId, validatedSnapshot))
      .resolves.toEqual({ ok: true, value: published });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("provision_official_amigo_catalog", {
      target_club_id: clubId,
      snapshot: validatedSnapshot,
    });
  });

  it("returns the same stable Result value on an idempotent retry", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: published, error: null }),
    });

    await expect(new SupabaseCatalogFacade().provisionOfficial(clubId, validatedSnapshot))
      .resolves.toEqual({ ok: true, value: published });
  });

  it("preserves actionable database conflicts as Result errors", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23514", message: "official source revision was already published with a different payload" },
      }),
    });

    await expect(new SupabaseCatalogFacade().provisionOfficial(clubId, validatedSnapshot)).resolves.toEqual({
      ok: false,
      error: {
        code: "provision_conflict",
        message: "official source revision was already published with a different payload",
      },
    });
  });
});
