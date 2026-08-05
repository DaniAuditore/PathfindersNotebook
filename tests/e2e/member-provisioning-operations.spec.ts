import { expect, test, type Page } from "@playwright/test";
import { expireInternalCredential, installLocalAuthFixtures, localActors } from "./local-auth-fixtures";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await installLocalAuthFixtures();
});

async function signInDirector(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Nombre de usuario").fill(localActors.director.email);
  await page.getByLabel("Contraseña").fill(localActors.director.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/members");
}

async function provisionMember(page: Page, username: string, fullName: string) {
  const form = page.locator("form").filter({ has: page.locator('input[name="username"]') });
  await form.getByLabel("Nombre completo").fill(fullName);
  await form.getByLabel("Fecha de nacimiento").fill("1990-01-01");
  await form.getByLabel("Nombre de usuario interno").fill(username);
  await form.getByRole("button", { name: "Registrar y revelar una vez" }).click();
  const disclosure = form.getByRole("status");
  await expect(disclosure).toContainText("No se mostrarán de nuevo.");
  const text = await disclosure.textContent();
  const temporaryPassword = text?.match(/contraseña temporal ([^.]+)\./)?.[1];
  if (!temporaryPassword) throw new Error("The one-time credential disclosure did not contain a password.");
  return temporaryPassword;
}

test("la provisión revela una contraseña una sola vez, no la transporta y fuerza el cambio", async ({ page, context }, testInfo) => {
  const username = `e2e-provision-${testInfo.project.name}`;
  await signInDirector(page);
  const historyLength = await page.evaluate(() => history.length);
  const temporaryPassword = await provisionMember(page, username, `Miembro provisión ${testInfo.project.name}`);

  await expect(page).toHaveURL(/\/members$/);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(await page.evaluate(() => location.href)).not.toContain(temporaryPassword);
  expect(JSON.stringify(await context.storageState())).not.toContain(temporaryPassword);
  await page.reload();
  await expect(page.getByText("No se mostrarán de nuevo.")).not.toBeVisible();
  await expect(page.locator("body")).not.toContainText(temporaryPassword);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Nombre de usuario").fill(username);
  await page.getByLabel("Contraseña").fill(temporaryPassword);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/change-password$/);

  await page.goto("/members");
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("contraseña-local-e2e-nueva");
  await page.getByLabel("Confirme la nueva contraseña", { exact: true }).fill("contraseña-local-e2e-nueva");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("la expiración de una credencial temporal niega el acceso sin revelar un secreto", async ({ page }, testInfo) => {
  const username = `e2e-expired-${testInfo.project.name}`;
  await signInDirector(page);
  const temporaryPassword = await provisionMember(page, username, `Miembro expirado ${testInfo.project.name}`);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  expireInternalCredential(username);

  await page.getByLabel("Nombre de usuario").fill(username);
  await page.getByLabel("Contraseña").fill(temporaryPassword);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/login\?error=login$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("No se pudo iniciar sesión.");
  await expect(page.locator("body")).not.toContainText("contraseña temporal");
});

test("la dirección crea una unidad y ejecuta traslado y asignación de personal", async ({ page }, testInfo) => {
  const username = `e2e-operations-${testInfo.project.name}`;
  const fullName = `Miembro operaciones ${testInfo.project.name}`;
  const unitName = `Unidad adicional ${testInfo.project.name}`;
  await signInDirector(page);

  const unitForm = page.locator("form").filter({ hasText: "Nueva unidad" });
  await unitForm.getByLabel("Nueva unidad").fill(unitName);
  await unitForm.getByRole("button", { name: "Crear unidad" }).click();
  await expect(page).toHaveURL(/\/members\?message=operation$/);
  await expect(page.getByText("La operación se completó.", { exact: true })).toBeVisible();

  await provisionMember(page, username, fullName);
  const memberCard = page.locator("article").filter({ hasText: fullName });
  await memberCard.getByLabel("Trasladar a").selectOption({ label: unitName });
  await memberCard.getByRole("button", { name: "Trasladar" }).click();
  await expect(page).toHaveURL(/\/members\?message=operation$/);
  await expect(page.getByText("La operación se completó.", { exact: true })).toBeVisible();

  const refreshedCard = page.locator("article").filter({ hasText: fullName });
  await refreshedCard.getByLabel("Asignar rol").selectOption("INSTRUCTOR");
  await refreshedCard.locator('select[name="unitId"]').last().selectOption({ label: unitName });
  await refreshedCard.getByRole("button", { name: "Asignar" }).click();
  await expect(page).toHaveURL(/\/members\?message=operation$/);
  await expect(page.getByText("La operación se completó.", { exact: true })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: fullName })).toContainText(`INSTRUCTOR · ${unitName}`);
});
