import { expect, test } from "@playwright/test";
import { open, tinyPng } from "./helpers";

test("upload → appears in queue as processing → fills in over the socket", async ({ page }) => {
  await open(page, "/queue", '[data-testid="queue-row"]');
  const before = await page.locator('[data-testid="queue-row"]').count();

  await page.getByRole("button", { name: "Upload fax" }).click();
  await page
    .getByTestId("fax-input")
    .setInputFiles({ name: "rx.png", mimeType: "image/png", buffer: tinyPng });

  await expect(page.getByText(/Fax received/)).toBeVisible();
  await expect(page.locator('[data-testid="queue-row"]')).toHaveCount(before + 1);
  const row = page.locator('[data-order-id="ord_up1"]');
  await expect(row).toContainText("Processing");
  // The mock pipeline finishes ~3.5 s later and pushes order.updated; no reload.
  await expect(row).toContainText("Metformin HCl", { timeout: 10_000 });
});

test("rejects unsupported files with a fix-it message", async ({ page }) => {
  await open(page, "/queue", '[data-testid="queue-row"]');
  await page.getByRole("button", { name: "Upload fax" }).click();
  await page
    .getByTestId("fax-input")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByRole("alert")).toContainText("Use a PDF, TIFF or PNG file.");
});

test("queue filters, keyboard navigation and enter-to-open", async ({ page }) => {
  await open(page, "/queue", '[data-testid="queue-row"]');
  await expect(page.locator('[data-testid="queue-row"]').first()).toContainText("Blocked");
  await page.getByRole("tab", { name: /Ready/ }).click();
  for (const row of await page.locator('[data-testid="queue-row"]').all())
    await expect(row).toContainText("Ready");
  await page.getByRole("tab", { name: /All/ }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/orders\/ord_smudged/);
});
