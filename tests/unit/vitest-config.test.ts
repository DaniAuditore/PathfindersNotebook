import { describe, expect, it } from "vitest";

import config from "../../vitest.config";

describe("Vitest test boundaries", () => {
  it("does not collect Playwright E2E files", () => {
    expect(config.test?.exclude).toContain("tests/e2e/**");
  });
});
