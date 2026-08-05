import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateTemporaryPassword, initialPasswordChangeTokenHash, syntheticMemberAlias } from "@/modules/identity/infrastructure/supabase-auth-admin";

describe("internal member credentials", () => {
  it("derives a private non-routable alias without using the username", () => {
    const alias = syntheticMemberAlias("11111111-1111-4111-8111-111111111111");
    expect(alias).toBe("m.11111111-1111-4111-8111-111111111111@members.invalid");
    expect(alias).not.toContain("@example");
  });

  it("generates distinct response-only temporary passwords", () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encodes the initial-change token digest as a PostgreSQL bytea literal", () => {
    expect(initialPasswordChangeTokenHash("opaque-change-token")).toBe("\\x826160ef12ac2b12df28c8022a55a9b1863b51e5738fa01f1514ee5d6e6fc46c");
  });

  it("rejects aliases not tied to a UUID correlation", () => {
    expect(() => syntheticMemberAlias("member-name")).toThrow("Invalid provisioning correlation.");
  });
});
