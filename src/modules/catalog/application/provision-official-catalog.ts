import type { ProvisionOfficialCatalogPort, ProvisionOfficialCatalogResult } from "./catalog-facade";
import { validateOfficialRegularAmigoSnapshot } from "../domain/official-template";

export interface ProvisionOfficialCatalogCommand {
  clubId: string;
  snapshot: unknown;
}

/** Application use case: untrusted data cannot cross the transactional port. */
export class ProvisionOfficialCatalog {
  constructor(private readonly port: ProvisionOfficialCatalogPort) {}

  async execute(command: ProvisionOfficialCatalogCommand): Promise<ProvisionOfficialCatalogResult> {
    const validation = validateOfficialRegularAmigoSnapshot(command.snapshot);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "official_snapshot_invalid",
          message: "The official regular-Amigo snapshot failed canonical validation.",
          details: validation.errors,
        },
      };
    }

    return this.port.provisionOfficial(command.clubId, validation.value);
  }
}
