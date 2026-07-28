import { expect, test } from "@playwright/test";

const protectedRoutes = ["/dashboard", "/classes", "/enrollments", "/reviews", "/operaciones-no-disponibles"] as const;

for (const route of protectedRoutes) {
  test(`no expone ${route} a una sesión anónima`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("main")).toBeVisible();
  });
}

test("el acceso mantiene reflujo a 320px sin mostrar una operación privilegiada", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/login");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText("Administrar roles")).not.toBeVisible();
});
