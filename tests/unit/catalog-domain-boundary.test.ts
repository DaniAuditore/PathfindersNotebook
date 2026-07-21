import { describe, expect, it } from "vitest";

import type { ClassType } from "@/modules/catalog/domain/class-type";

describe("catalog domain boundary", () => {
  it("models the allowed class classifications without infrastructure", () => {
    const classType: ClassType = "advanced";

    expect(classType).toBe("advanced");
  });
});
