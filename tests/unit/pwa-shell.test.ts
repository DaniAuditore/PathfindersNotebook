import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("shell PWA seguro", () => {
  it("declara una instalación standalone en español con icono de producto", () => {
    expect(manifest()).toMatchObject({
      lang: "es",
      start_url: "/",
      display: "standalone",
      theme_color: "#075985",
      background_color: "#f7f8fb",
    });
    expect(manifest().icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon.svg", purpose: "any" }),
      expect.objectContaining({ src: "/icon.svg", purpose: "maskable" }),
    ]));
  });

  it("mantiene el worker dentro de la allowlist pública explícita", async () => {
    const worker = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(worker).toContain('const OFFLINE_URL = "/offline.html"');
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain('if (request.method !== "GET") return');
    expect(worker).toContain('url.origin !== self.location.origin');
    expect(worker).toContain('if (request.mode === "navigate")');
    expect(worker).toContain('if (url.pathname !== "/login") return');
    expect(worker).toContain('if (request.method !== "GET") return');
    expect(worker).toContain('if (!url.pathname.startsWith("/_next/static/")) return');
    expect(worker).toContain('event.respondWith(fetch(request).catch(async () => {');
    expect(worker).toContain('cache.put(request, response.clone())');
    expect(worker).not.toContain("clients.claim");
    expect(worker).not.toContain("navigationPreload");
  });
});
