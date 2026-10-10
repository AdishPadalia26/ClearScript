import { expect, test, type Page } from "@playwright/test";
import { field, open } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function expectFhir(page: Page) {
  const modal = page.getByTestId("fhir-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('"resourceType": "Bundle"');
  await expect(modal).toContainText("MedicationRequest");
}

test("clean order: hover shows the box, approve shows FHIR", async ({ page }) => {
  await open(page, "/orders/ord_clean", '[data-field="drug.name"]');
  await expect(page.getByTestId("summary")).toContainText("0 blocking");
  await field(page, "drug.strength").hover();
  await expect(page.locator('[data-box="drug.strength"][data-active]')).toBeVisible();

  await page.getByTestId("approve").click();
  await page.getByTestId("confirm-approve").click();
  await expectFhir(page);
  await expect(page.getByRole("button", { name: "Next order" })).toBeVisible();
});

test("smudged order: approve blocked until strength is resolved by edit (keyboard only)", async ({
  page,
}) => {
  await open(page, "/orders/ord_smudged", '[data-field="drug.strength"]');
  await expect(page.getByTestId("approve")).toBeDisabled();

  // J → Enter opens the drawer on the first flag (drug name) → J moves to strength → E edit → type → Enter.
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("field-drawer")).toBeVisible();
  await page.keyboard.press("j");
  await expect(page.getByTestId("field-drawer")).toContainText("drug.strength");
  await page.keyboard.press("e");
  await page.getByLabel("Correct value").fill("500 mg");
  await page.keyboard.press("Enter");

  await expect(field(page, "drug.strength")).toHaveAttribute("data-triage", "green");
  await expect(field(page, "drug.strength")).toContainText("Edited by pharmacist");
  await expect(page.getByTestId("approve")).toBeEnabled();

  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+Enter`);
  await page.getByTestId("confirm-approve").click();
  await expectFhir(page);
});

test("drawer shows each reader's crop with the disagreeing read highlighted", async ({ page }) => {
  await open(page, "/orders/ord_smudged", '[data-field="drug.strength"]');
  await field(page, "drug.strength").click();
  const drawer = page.getByTestId("field-drawer");
  await expect(drawer.locator('[data-testid="crop"]')).toHaveCount(4);
  await expect(drawer.locator("[data-disagrees]")).toHaveCount(1);
  await expect(drawer.locator("[data-disagrees]")).toHaveAttribute("data-source", "model_c");
  // Crops actually drew pixels (canvas sized at device resolution, not the skeleton).
  await expect
    .poll(() =>
      drawer
        .locator('[data-testid="crop"]')
        .first()
        .evaluate((c: HTMLCanvasElement) => c.width),
    )
    .toBeGreaterThan(100);
});

test("overlays stay aligned at ~50%, 100% and ~200% zoom", async ({ page }) => {
  await open(page, "/orders/ord_smudged", '[data-field="drug.strength"]');
  await page.getByRole("button", { name: "All boxes" }).click();
  const stage = page.getByTestId("fax-stage");
  const box = page.locator('[data-box="drug.strength"]');

  const check = async () => {
    const s = (await stage.boundingBox())!;
    const b = (await box.boundingBox())!;
    const [l, t] = await box.evaluate((el: HTMLElement) => [
      parseFloat(el.style.left),
      parseFloat(el.style.top),
    ]);
    expect(Math.abs(b.x - (s.x + (l! / 100) * s.width))).toBeLessThan(1.5);
    expect(Math.abs(b.y - (s.y + (t! / 100) * s.height))).toBeLessThan(1.5);
  };

  await page.getByRole("button", { name: "100%" }).click();
  await check();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in" }).click(); // ≈195%
  await check();
  await page.getByRole("button", { name: "100%" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom out" }).click(); // ≈51%
  await check();
});

test("clicking a box on the fax opens that field", async ({ page }) => {
  await open(page, "/orders/ord_smudged", '[data-field="drug.strength"]');
  await page.getByRole("button", { name: "All boxes" }).click();
  await page.locator('[data-box="prescriber.npi"]').click();
  await expect(page.getByTestId("field-drawer")).toContainText("prescriber.npi");
});
