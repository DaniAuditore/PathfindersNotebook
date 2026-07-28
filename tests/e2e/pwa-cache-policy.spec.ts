import { expect, test } from "@playwright/test";

async function registerAndControl(page: import("@playwright/test").Page) {
  await page.goto("/offline.html");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 5_000 });
}

async function cachedPaths(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(names.map(async (name) => {
      const cache = await caches.open(name);
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    }));
    return entries.flat().sort();
  });
}

test("expone metadata PWA y registra un worker con caché pública acotada", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Firefox headless does not reliably assign a service-worker controller on this local HTTP server.");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  await expect(manifestResponse).toBeOK();
  await expect(manifestResponse.json()).resolves.toMatchObject({ lang: "es", display: "standalone", start_url: "/" });

  await registerAndControl(page);
  await expect(page.getByRole("main")).toContainText("Estás sin conexión");
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();

  const keys = await cachedPaths(page);
  expect(keys).toEqual(["/offline.html"]);
});

test("sólo la navegación pública exacta de acceso usa el fallback offline", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "The local Firefox/WebKit harness cannot reliably exercise an offline controlled navigation.");
  const context = await browser.newContext();
  const control = await context.newPage();
  await registerAndControl(control);
  await context.setOffline(true);

  const login = await context.newPage();
  await login.goto("/login");
  await expect(login.getByRole("main")).toContainText("Estás sin conexión");
  await expect(login).toHaveURL(/\/login$/);

  const protectedPage = await context.newPage();
  await expect(protectedPage.goto("/dashboard")).rejects.toThrow();
  await expect(cachedPaths(control)).resolves.toEqual(["/offline.html"]);
  await context.close();
});

test("detecta una actualización instalada y sólo la activa al confirmarla", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The local Firefox/WebKit harness cannot reliably exercise a controlled service-worker update.");
  await page.goto("/login");
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active && navigator.serviceWorker.controller);
  }, undefined, { timeout: 5_000 });

  const initialWorker = await page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.ready).active;
    if (!worker) throw new Error("No hay worker activo para verificar la actualización.");
    return worker.scriptURL;
  });
  expect(initialWorker).toMatch(/\/sw\.js$/);
  // Allow the root client island to attach its updatefound listener to the existing registration.
  await page.waitForTimeout(100);
  await expect(page.getByText("Hay una actualización disponible.")).not.toBeVisible();

  await page.request.post("/__e2e__/enable-sw-update");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting), undefined, { timeout: 5_000 });
  // Reopening the client proves the registration island discovers an already-waiting deployment without activating it.
  await page.reload();

  const updateNotice = page.getByRole("status").filter({ hasText: "Hay una actualización disponible." });
  await expect(updateNotice).toBeVisible();
  await expect(updateNotice.getByRole("button", { name: "Actualizar ahora" })).toBeVisible();
  await expect(page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.ready).active;
    if (!worker) throw new Error("La actualización activó el worker antes de la confirmación.");
    return worker.scriptURL;
  })).resolves.toBe(initialWorker);

  const reload = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame() && frame.url().endsWith("/login"));
  await updateNotice.getByRole("button", { name: "Actualizar ahora" }).click();
  await reload;
  await page.waitForFunction(() => caches.has("pathfinders-static-e2e-update-v2"), undefined, { timeout: 5_000 });
});

test("no almacena API, evidencia, Supabase, POST ni otras navegaciones", async ({ browser, browserName }) => {
  test.skip(browserName === "firefox", "Firefox headless does not reliably assign a service-worker controller on this local HTTP server.");
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndControl(page);
  await context.setOffline(true);

  const outcomes = await page.evaluate(async () => {
    const attempt = async (input: RequestInfo | URL, init?: RequestInit) => {
      try { await fetch(input, init); return "resolved"; } catch { return "rejected"; }
    };
    return Promise.all([
      attempt("/api/does-not-exist"),
      attempt("/api/files/private-evidence"),
      attempt("https://example.invalid/rest/v1/private_evidence"),
      attempt("/dashboard"),
      attempt("/api/does-not-exist", { method: "POST" }),
    ]);
  });
  expect(outcomes).toEqual(["rejected", "rejected", "rejected", "rejected", "rejected"]);

  await expect(cachedPaths(page)).resolves.toEqual(["/offline.html"]);
  await context.close();
});

test("conserva sólo estáticos públicos y los sirve sin conexión", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "The local Firefox/WebKit harness cannot reliably exercise a controlled offline static-cache read.");
  await page.goto("/login");
  await registerAndControl(page);
  await page.goto("/login");
  const staticPath = await page.evaluate(() => {
    const resource = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => new URL(name).pathname.startsWith("/_next/static/"));
    if (!resource) throw new Error("No se cargó un recurso estático público para auditar.");
    return new URL(resource).pathname;
  });

  await expect(page.evaluate((path) => fetch(path).then((response) => response.ok), staticPath)).resolves.toBe(true);
  const keys = await cachedPaths(page);
  expect(keys).toContain("/offline.html");
  expect(keys).toContain(staticPath);
  expect(keys.every((path) => path === "/offline.html" || path.startsWith("/_next/static/"))).toBe(true);

  await context.setOffline(true);
  await expect(page.evaluate((path) => fetch(path).then((response) => response.text()), staticPath)).resolves.not.toEqual("");
});
