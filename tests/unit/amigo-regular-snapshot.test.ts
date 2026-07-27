import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import snapshot from "@/modules/catalog/infrastructure/official/amigo-regular.es.json";
import visualLabelOracle from "../fixtures/amigo-regular-visual-labels.es.json";

const EXPECTED_PDF_SHA256 = "c29d62235ebfb819a89759f01af8e98858817ce3bc2d9947b5af11b652ad139a";
const PDF_PATH = resolve(process.cwd(), "docs/1 Tarjeta de Amigo2.pdf");
const ROOT_DISTRIBUTION = [6, 3, 2, 2, 3, 1, 3, 4, 1];
const CHILD_COUNTS = new Map([
  ["amigo.reg.s02.r01", 4],
  ["amigo.reg.s02.r02", 4],
  ["amigo.reg.s02.r03", 59],
  ["amigo.reg.s03.r01", 3],
  ["amigo.reg.s05.r01", 4],
  ["amigo.reg.s05.r02", 3],
  ["amigo.reg.s07.r01", 5],
  ["amigo.reg.s08.r01", 14],
]);

type Requirement = (typeof snapshot.requirements)[number];

function childrenOf(parentSourceCode: string): Requirement[] {
  return snapshot.requirements.filter((requirement) => "parentSourceCode" in requirement && requirement.parentSourceCode === parentSourceCode);
}

function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest().subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("canonical regular Amigo snapshot", () => {
  it("records undated visual-source provenance and the exact supplied PDF hash", () => {
    expect(snapshot.source).toMatchObject({
      documentTitle: "Tarjeta de Clase Amigo",
      authority: "División Sudamericana, Ministerio de Conquistadores y Aventureros",
      locale: "es",
      documentSha256: EXPECTED_PDF_SHA256,
      revisionKey: "dsa-amigo-official-card-es-undated",
      isUndated: true,
      visualPageReferences: [2, 3, 4, 5],
    });
    expect(snapshot.source).not.toHaveProperty("editionYear");
    expect(snapshot.source.provenance).toContain("imágenes visibles prevalecen sobre el OCR");
  });

  it("optionally verifies the local untracked source without requiring it in CI", () => {
    if (!existsSync(PDF_PATH)) return;
    expect(createHash("sha256").update(readFileSync(PDF_PATH)).digest("hex")).toBe(EXPECTED_PDF_SHA256);
  });

  it("contains exactly 9 ordered sections, 25 roots, 96 children, and 121 rows", () => {
    const roots = snapshot.requirements.filter((requirement) => !("parentSourceCode" in requirement));
    const children = snapshot.requirements.filter((requirement) => "parentSourceCode" in requirement);

    expect(snapshot.sections).toHaveLength(9);
    expect(snapshot.sections.map((section) => section.position)).toEqual([...Array(9).keys()]);
    expect(roots).toHaveLength(25);
    expect(children).toHaveLength(96);
    expect(snapshot.requirements).toHaveLength(121);
    expect(snapshot.sections.map((section) => roots.filter((root) => root.sectionCode === section.sourceCode).length)).toEqual(ROOT_DISTRIBUTION);
  });

  it("preserves deterministic hierarchy ordering and every decomposed option count", () => {
    const expectedTraversal: string[] = [];
    for (const section of snapshot.sections) {
      const roots = snapshot.requirements
        .filter((requirement) => !("parentSourceCode" in requirement) && requirement.sectionCode === section.sourceCode)
        .sort((left, right) => left.position - right.position);
      expect(roots.map((root) => root.position)).toEqual([...Array(roots.length).keys()]);
      for (const root of roots) {
        expectedTraversal.push(root.sourceCode);
        const children = childrenOf(root.sourceCode);
        expect(children.map((child) => child.position)).toEqual([...Array(children.length).keys()]);
        expectedTraversal.push(...children.map((child) => child.sourceCode));
      }
    }
    expect(snapshot.requirements.map((requirement) => requirement.sourceCode)).toEqual(expectedTraversal);
    expect(new Map([...CHILD_COUNTS.keys()].map((code) => [code, childrenOf(code).length]))).toEqual(CHILD_COUNTS);
  });

  it("keeps all entity IDs and source codes unique and UUIDv5-derived", () => {
    const entities = [
      { id: snapshot.source.id, code: snapshot.source.sourceCode },
      { id: snapshot.family.id, code: snapshot.family.familyCode },
      { id: snapshot.level.id, code: snapshot.level.levelCode },
      ...snapshot.sections.map((section) => ({ id: section.id, code: section.sourceCode })),
      ...snapshot.requirements.map((requirement) => ({ id: requirement.id, code: requirement.sourceCode })),
    ];
    const codes = entities.map((entity) => entity.code);
    const ids = entities.map((entity) => entity.id);

    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(codes.map((code) => uuidV5(snapshot.uuidNamespace.id, code)));
  });

  it("preserves the 59 visible Bible checklist items and grouped references exactly", () => {
    const bible = childrenOf("amigo.reg.s02.r03");
    expect(bible.slice(0, 38)).toHaveLength(38);
    expect(bible.slice(38)).toHaveLength(21);
    expect(bible[11].title).toBe("Gn 14;18-24");
    expect(bible[25].title).toBe("Gn 30:25-31; 31:2-3, 17-18");
    expect(bible.slice(31, 37).map((item) => item.title)).toEqual(["Gn. 41", "Gn. 42", "Gn. 43", "Gn. 44", "Gn. 45", "Gn. 47"]);
    expect(bible[58].title).toBe("Éx 35:4-29 e 40");
  });

  it("matches the independently reviewed visual label oracle for all 121 rows", () => {
    expect(visualLabelOracle.sourceDocumentSha256).toBe(EXPECTED_PDF_SHA256);
    expect(visualLabelOracle.labels).toHaveLength(121);
    expect(snapshot.requirements.map(({ sourceCode, title }) => ({ sourceCode, displayText: title }))).toEqual(visualLabelOracle.labels);
  });

  it("encodes root-only class weight and exact compound completion semantics", () => {
    const roots = snapshot.requirements.filter((requirement) => !("parentSourceCode" in requirement));
    const children = snapshot.requirements.filter((requirement) => "parentSourceCode" in requirement);
    expect(roots.every((root) => root.weight === 1 && root.optional === false)).toBe(true);
    expect(children.every((child) => child.weight === 0 && child.completion.kind === "direct")).toBe(true);
    expect(roots.reduce((sum, root) => sum + root.weight, 0)).toBe(25);
    expect(snapshot.requirements.find((requirement) => requirement.sourceCode === "amigo.reg.s03.r01")?.completion).toEqual({ kind: "at_least_n", threshold: 2 });
    expect(snapshot.requirements.find((requirement) => requirement.sourceCode === "amigo.reg.s05.r01")?.completion).toEqual({ kind: "at_least_one" });
  });

  it("uses only AC1 requirement types, modalities, and valid completion contracts", () => {
    const requirementTypes = new Set(["manual", "file", "link", "text", "checklist", "numeric", "compound"]);
    const modalities = new Set(["administrative", "automatic", "reading", "memorization_oral", "written", "participation", "specialty", "practical_in_person"]);

    for (const requirement of snapshot.requirements) {
      expect(requirementTypes.has(requirement.requirementType)).toBe(true);
      expect(requirement.modalities.length).toBeGreaterThan(0);
      expect(requirement.modalities.every((modality) => modalities.has(modality))).toBe(true);
      if (requirement.completion.kind === "direct") expect(requirement.requirementType).not.toBe("compound");
      else expect(requirement.requirementType).toBe("compound");
      if (requirement.completion.kind === "at_least_n") {
        expect(requirement.completion.threshold).toBeGreaterThan(0);
        expect(requirement.completion.threshold).toBeLessThanOrEqual(childrenOf(requirement.sourceCode).length);
      }
    }
  });

  it("uses the visible Vaso de Barro wording and excludes advanced data", () => {
    const generalFive = snapshot.requirements.find((requirement) => requirement.sourceCode === "amigo.reg.s01.r05");
    expect(generalFive?.title).toBe("Leer el libro Vaso de Barro.");
    expect(snapshot.requirements.some((requirement) => requirement.title.includes("Por La Gracia de Dios"))).toBe(false);
    expect(snapshot.level.classType).toBe("regular");
    expect(snapshot.requirements.every((requirement) => requirement.sourceCode.startsWith("amigo.reg."))).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("amigo.naturaleza");
  });
});
