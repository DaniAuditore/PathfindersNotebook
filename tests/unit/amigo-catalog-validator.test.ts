import { describe, expect, it } from "vitest";

import { validateOfficialRegularAmigoSnapshot } from "@/modules/catalog/domain/official-template";
import snapshot from "@/modules/catalog/infrastructure/official/amigo-regular.es.json";

type JsonRecord = Record<string, unknown>;

function cloneSnapshot(): JsonRecord {
  return structuredClone(snapshot) as unknown as JsonRecord;
}

function object(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("test fixture is not an object");
  return value as JsonRecord;
}

function rows(value: JsonRecord, key: "sections" | "requirements"): JsonRecord[] {
  const items = value[key];
  if (!Array.isArray(items) || !items.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
    throw new Error(`test fixture ${key} is not an array of objects`);
  }
  return items as JsonRecord[];
}

function requirement(value: JsonRecord, sourceCode: string): JsonRecord {
  const found = rows(value, "requirements").find((item) => item.sourceCode === sourceCode);
  if (!found) throw new Error(`missing test requirement ${sourceCode}`);
  return found;
}

function errorCodes(value: unknown): string[] {
  const result = validateOfficialRegularAmigoSnapshot(value);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

function expectCanonicalError(value: unknown, sourceCode: string, field: string): void {
  const result = validateOfficialRegularAmigoSnapshot(value);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors).toContainEqual(expect.objectContaining({
    code: "canonical_drift",
    path: expect.stringContaining(field),
    message: expect.stringContaining(`sourceCode ${sourceCode}`),
  }));
}

function expectDeterministicIdError(value: unknown, path: string, sourceCode: string, expectedId: string): void {
  const result = validateOfficialRegularAmigoSnapshot(value);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors).toContainEqual(expect.objectContaining({
    code: "deterministic_id",
    path,
    message: expect.stringContaining(`expected UUIDv5 ${expectedId} derived from ${sourceCode}`),
  }));
}

describe("official regular Amigo production validator", () => {
  it("accepts the current canonical snapshot at the application/domain boundary", () => {
    const result = validateOfficialRegularAmigoSnapshot(snapshot);

    expect(result).toEqual({ ok: true, value: snapshot });
  });

  it("returns actionable Result errors instead of throwing for malformed external input", () => {
    expect(() => validateOfficialRegularAmigoSnapshot({ sections: null })).not.toThrow();
    const result = validateOfficialRegularAmigoSnapshot({ sections: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ code: "invalid_shape", path: "uuidNamespace" }));
  });

  it("rejects unsupported schema versions independently", () => {
    const value = cloneSnapshot();
    value.schemaVersion = 2;
    expect(errorCodes(value)).toContain("unsupported_schema_version");
  });

  it.each([
    ["authority", "Unofficial authority"],
    ["documentSha256", "0".repeat(64)],
    ["isUndated", false],
    ["provenance", ""],
  ])("rejects invalid source provenance field %s", (field, invalid) => {
    const value = cloneSnapshot();
    object(value.source)[field] = invalid;
    expect(errorCodes(value)).toContain("invalid_provenance");
  });

  it("rejects every supported-but-wrong runtime probe with sourceCode and field diagnostics", () => {
    const documentTitle = cloneSnapshot();
    object(documentTitle.source).documentTitle = "Tarjeta oficial alterada";
    expectCanonicalError(documentTitle, "dsa.amigo.es", "documentTitle");

    const visibleLabel = cloneSnapshot();
    requirement(visibleLabel, "amigo.reg.s01.r03").title = "Texto oficial alterado";
    expectCanonicalError(visibleLabel, "amigo.reg.s01.r03", "title");

    const childRole = cloneSnapshot();
    requirement(childRole, "amigo.reg.s03.r01.c01").childRole = "step";
    expectCanonicalError(childRole, "amigo.reg.s03.r01.c01", "childRole");

    const completion = cloneSnapshot();
    requirement(completion, "amigo.reg.s03.r01").completion = { kind: "at_least_n", threshold: 1 };
    expectCanonicalError(completion, "amigo.reg.s03.r01", "completion");

    const modalities = cloneSnapshot();
    requirement(modalities, "amigo.reg.s01.r01").modalities = ["reading"];
    expectCanonicalError(modalities, "amigo.reg.s01.r01", "modalities");
  });

  it("compares document, family, level, section, and requirement labels as exact canonical values", () => {
    const probes: readonly [JsonRecord, string, string][] = [
      [object(cloneSnapshot().source), "dsa.amigo.es", "documentTitle"],
      [object(cloneSnapshot().family), "amigo", "title"],
      [object(cloneSnapshot().level), "amigo.regular", "title"],
      [rows(cloneSnapshot(), "sections")[0], "amigo.reg.s01", "title"],
      [requirement(cloneSnapshot(), "amigo.reg.s01.r01"), "amigo.reg.s01.r01", "title"],
    ];

    for (const [target, sourceCode, field] of probes) {
      const value = cloneSnapshot();
      const actualTarget = sourceCode === "dsa.amigo.es" ? object(value.source)
        : sourceCode === "amigo" ? object(value.family)
          : sourceCode === "amigo.regular" ? object(value.level)
            : sourceCode === "amigo.reg.s01" ? rows(value, "sections")[0]
              : requirement(value, sourceCode);
      actualTarget[field] = `${String(target[field])} alterado`;
      expectCanonicalError(value, sourceCode, field);
    }
  });

  it.each([
    "amigo.reg.s01.r01",
    "amigo.reg.s02.r01",
    "amigo.reg.s03.r02",
    "amigo.reg.s04.r01",
    "amigo.reg.s05.r03",
    "amigo.reg.s06.r01",
    "amigo.reg.s07.r02",
    "amigo.reg.s08.r02",
    "amigo.reg.s09.r01",
  ])("rejects visible-label drift in section representative %s", (sourceCode) => {
    const value = cloneSnapshot();
    requirement(value, sourceCode).title = `${String(requirement(value, sourceCode).title)} alterado`;
    expectCanonicalError(value, sourceCode, "title");
  });

  it.each([
    ["amigo.reg.s02.r01.c01", "option"],
    ["amigo.reg.s02.r02.c01", "step"],
    ["amigo.reg.s02.r03.c01", "step"],
    ["amigo.reg.s03.r01.c01", "step"],
    ["amigo.reg.s05.r01.c01", "step"],
    ["amigo.reg.s05.r02.c01", "option"],
    ["amigo.reg.s07.r01.c01", "step"],
    ["amigo.reg.s08.r01.c01", "step"],
  ])("rejects canonical childRole drift in compound group representative %s", (sourceCode, childRole) => {
    const value = cloneSnapshot();
    requirement(value, sourceCode).childRole = childRole;
    expectCanonicalError(value, sourceCode, "childRole");
  });

  it("checks exact pre-reviewed UUIDv5 IDs without calculating SHA-1 in domain code", () => {
    const probes: readonly [string, string, string, (value: JsonRecord) => JsonRecord][] = [
      ["source.id", "dsa.amigo.es", "d57be2a8-7a6a-5fdb-9181-99aaad22ebaa", (value) => object(value.source)],
      ["family.id", "amigo", "56590aef-c83d-56a0-be21-ff87940bb156", (value) => object(value.family)],
      ["level.id", "amigo.regular", "e2f7bfec-2ce3-5e78-ad31-d16a2611bef6", (value) => object(value.level)],
      ["sections[0].id", "amigo.reg.s01", "86d1e0c8-2bfe-5d98-9188-ad9313cbcec9", (value) => rows(value, "sections")[0]],
      ["requirements[0].id", "amigo.reg.s01.r01", "7cf5090a-2aa5-5bb5-9367-48d55d17e07f", (value) => requirement(value, "amigo.reg.s01.r01")],
    ];

    for (const [path, sourceCode, expectedId, select] of probes) {
      const value = cloneSnapshot();
      const target = select(value);
      target.id = "00000000-0000-5000-8000-000000000000";
      expectDeterministicIdError(value, path, sourceCode, expectedId);
    }
  });

  it("rejects duplicate IDs and source codes", () => {
    const duplicateId = cloneSnapshot();
    rows(duplicateId, "sections")[1].id = rows(duplicateId, "sections")[0].id;
    expect(errorCodes(duplicateId)).toContain("duplicate_id");

    const duplicateCode = cloneSnapshot();
    rows(duplicateCode, "requirements")[1].sourceCode = rows(duplicateCode, "requirements")[0].sourceCode;
    expect(errorCodes(duplicateCode)).toContain("duplicate_code");
  });

  it.each([
    ["section_count", "sections"],
    ["root_count", "root"],
    ["child_count", "child"],
    ["row_count", "row"],
  ])("rejects the exact %s contract", (expectedCode, mutation) => {
    const value = cloneSnapshot();
    if (mutation === "sections") rows(value, "sections").pop();
    if (mutation === "root") value.requirements = rows(value, "requirements").filter((item) => item.sourceCode !== "amigo.reg.s09.r01");
    if (mutation === "child") value.requirements = rows(value, "requirements").filter((item) => item.sourceCode !== "amigo.reg.s02.r01.c01");
    if (mutation === "row") rows(value, "requirements").push(structuredClone(rows(value, "requirements")[0]));
    expect(errorCodes(value)).toContain(expectedCode);
  });

  it("rejects the exact root distribution", () => {
    const value = cloneSnapshot();
    requirement(value, "amigo.reg.s01.r06").sectionCode = "amigo.reg.s02";
    expect(errorCodes(value)).toContain("root_distribution");
  });

  it.each([
    "amigo.reg.s02.r01.c04",
    "amigo.reg.s02.r02.c04",
    "amigo.reg.s02.r03.c59",
    "amigo.reg.s03.r01.c03",
    "amigo.reg.s05.r01.c04",
    "amigo.reg.s05.r02.c03",
    "amigo.reg.s07.r01.c05",
    "amigo.reg.s08.r01.c14",
  ])("rejects every canonical child-group count via %s", (sourceCode) => {
    const value = cloneSnapshot();
    value.requirements = rows(value, "requirements").filter((item) => item.sourceCode !== sourceCode);
    expect(errorCodes(value)).toContain("child_group_count");
  });

  it("rejects canonical traversal ordering and stable section identity independently", () => {
    const ordering = cloneSnapshot();
    const requirements = rows(ordering, "requirements");
    const moved = requirements.splice(requirements.findIndex((item) => item.sourceCode === "amigo.reg.s02.r01.c04"), 1)[0];
    requirements.splice(requirements.findIndex((item) => item.sourceCode === "amigo.reg.s02.r02") + 1, 0, moved);
    expectCanonicalError(ordering, "amigo.reg.s02.r01.c04", "sourceCode");

    const identity = cloneSnapshot();
    rows(identity, "sections")[0].slug = "generales-validos-pero-no-canonicos";
    expectCanonicalError(identity, "amigo.reg.s01", "slug");
  });

  it("rejects a broken 38 Genesis plus 21 Exodus ordered Bible contract", () => {
    const value = cloneSnapshot();
    requirement(value, "amigo.reg.s02.r03.c38").title = "Éx 1";
    expect(errorCodes(value)).toContain("bible_contract");
  });

  it("rejects duplicate, gapped, and unordered positions", () => {
    const value = cloneSnapshot();
    requirement(value, "amigo.reg.s01.r02").position = 0;
    expect(errorCodes(value)).toContain("invalid_position");
  });

  it("rejects orphan, cross-section, and cyclic hierarchy references", () => {
    const orphan = cloneSnapshot();
    requirement(orphan, "amigo.reg.s02.r01.c01").parentSourceCode = "amigo.reg.s02.missing";
    expect(errorCodes(orphan)).toContain("hierarchy_reference");

    const crossSection = cloneSnapshot();
    requirement(crossSection, "amigo.reg.s02.r01.c01").sectionCode = "amigo.reg.s01";
    expect(errorCodes(crossSection)).toContain("hierarchy_reference");

    const cycle = cloneSnapshot();
    requirement(cycle, "amigo.reg.s02.r01").parentSourceCode = "amigo.reg.s02.r01.c01";
    expect(errorCodes(cycle)).toContain("hierarchy_cycle");
  });

  it("rejects non-unit roots and weighted children independently", () => {
    const root = cloneSnapshot();
    requirement(root, "amigo.reg.s01.r01").weight = 0;
    expect(errorCodes(root)).toContain("root_weight");

    const child = cloneSnapshot();
    requirement(child, "amigo.reg.s02.r01.c01").weight = 1;
    expect(errorCodes(child)).toContain("child_weight");
  });

  it("rejects completion semantics that violate AC1–AC2", () => {
    const directCompound = cloneSnapshot();
    requirement(directCompound, "amigo.reg.s02.r01").completion = { kind: "direct" };
    expect(errorCodes(directCompound)).toContain("completion_semantics");

    const invalidThreshold = cloneSnapshot();
    requirement(invalidThreshold, "amigo.reg.s03.r01").completion = { kind: "at_least_n", threshold: 0 };
    expect(errorCodes(invalidThreshold)).toContain("completion_semantics");

    const derivedChild = cloneSnapshot();
    requirement(derivedChild, "amigo.reg.s02.r01.c01").completion = { kind: "all_children" };
    expect(errorCodes(derivedChild)).toContain("completion_semantics");

    const unsupportedType = cloneSnapshot();
    requirement(unsupportedType, "amigo.reg.s01.r01").requirementType = "remote";
    expect(errorCodes(unsupportedType)).toContain("completion_semantics");
  });

  it("rejects unsupported or empty modalities", () => {
    const value = cloneSnapshot();
    requirement(value, "amigo.reg.s01.r01").modalities = ["remote_guess"];
    expect(errorCodes(value)).toContain("invalid_modality");
  });

  it("rejects advanced rows in the regular snapshot", () => {
    const value = cloneSnapshot();
    requirement(value, "amigo.reg.s09.r01").sourceCode = "amigo.naturaleza.s01.r01";
    expect(errorCodes(value)).toContain("advanced_content");
  });
});
