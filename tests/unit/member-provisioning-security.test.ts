import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("member provisioning secret boundary", () => {
  it("returns the one-time credential only in the no-store Server Action result, never a URL or cookie", () => {
    const source = readFileSync(resolve(process.cwd(), "src/modules/clubs/presentation/member-actions.ts"), "utf8");

    expect(source).toContain('return { status: "success", username: command.username, temporaryPassword }');
    expect(source).not.toContain("temporaryPassword=");
    expect(source).not.toContain("encodeURIComponent(temporaryPassword)");
    expect(source).not.toContain("cookies(");
  });
});
