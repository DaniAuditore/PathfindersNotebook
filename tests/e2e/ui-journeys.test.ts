import { expect, test } from "@playwright/test";

const viewports = [
  { name: "320px", width: 320, height: 640 },
  { name: "390px", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  // A 720 CSS-pixel desktop viewport is the reflow-equivalent of 200% browser zoom on 1440px.
  { name: "zoom equivalente al 200%", width: 720, height: 450 },
] as const;

for (const viewport of viewports) {
  test(`el acceso conserva semántica y reflujo a ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByLabel("Nombre de usuario")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Nombre de usuario")).toBeFocused();
  });
}

test("no repite credenciales tras un error de acceso y enfoca el aviso seguro", async ({ page }) => {
  await page.goto("/login?error=login");

  const error = page.locator(".notice--error");
  await expect(error).toContainText("No se pudo iniciar sesión.");
  await expect(page.getByLabel("Nombre de usuario")).toHaveValue("");
  await expect(page.getByLabel("Contraseña")).toHaveValue("");
  await expect(error).toBeFocused();
  await expect(page).not.toHaveURL(/learner%40example|password|secret/i);
});
