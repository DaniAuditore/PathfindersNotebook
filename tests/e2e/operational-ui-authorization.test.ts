import { expect, test } from "@playwright/test";
import { installLocalAuthFixtures, localActors } from "./local-auth-fixtures";

const protectedRoutes = ["/dashboard", "/classes", "/enrollments", "/reviews", "/operaciones-no-disponibles", "/profile", "/students", "/club", "/members", "/audit", "/assessments"] as const;

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
  await expect(page.getByText("Auditoría")).not.toBeVisible();
});

test.describe("sesiones autenticadas locales y deterministas", () => {
  test.beforeAll(async () => {
    await installLocalAuthFixtures();
  });

  async function signIn(page: import("@playwright/test").Page, actor: keyof typeof localActors) {
    await page.goto("/login");
    await page.getByLabel("Nombre de usuario").fill(localActors[actor].email);
    await page.getByLabel("Contraseña").fill(localActors[actor].password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  test("la dirección ve evaluación e investidura, y la instrucción no recibe la acción reservada", async ({ page }) => {
    await signIn(page, "director");
    await page.goto("/assessments");
    await expect(page.getByText("Registrar evaluación")).toBeVisible();
    await expect(page.getByText("Registrar investidura")).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "instructor");
    await page.goto("/assessments");
    await expect(page.getByText("Registrar evaluación")).toBeVisible();
    await expect(page.getByText("Registrar investidura")).not.toBeVisible();
    await page.goto("/club");
    await expect(page.getByText("Sin clubes para actualizar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar club" })).not.toBeVisible();
  });

  test("la mutación permitida anuncia y enfoca su resultado", async ({ page }) => {
    await signIn(page, "director");
    await page.goto("/profile");
    await page.getByLabel("Nombre visible").fill("Directora local E2E actualizada");
    await page.getByRole("button", { name: "Guardar perfil" }).click();
    const result = page.getByText("Perfil actualizado.");
    await expect(result).toBeVisible();
    await expect(result).toBeFocused();
  });

  test("la auditoría autenticada pagina y no revela metadatos", async ({ page }) => {
    await signIn(page, "director");
    await page.goto("/audit");
    await expect(page.getByText("acción-local-26", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver acciones anteriores" })).toBeVisible();
    await expect(page.getByText("never-render@example.test")).not.toBeVisible();
    await expect(page.getByText("not-rendered")).not.toBeVisible();
    await page.getByRole("link", { name: "Ver acciones anteriores" }).click();
    await expect(page.getByText("acción-local-1", { exact: true })).toBeVisible();
  });
});
