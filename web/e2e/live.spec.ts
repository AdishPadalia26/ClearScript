import { expect, test } from "@playwright/test";

// Runs only with E2E_LIVE=1 against the real backend (NEXT_PUBLIC_API_MODE=live).
test.skip(process.env.E2E_LIVE !== "1", "live backend not requested");

test("live: queue loads, an order opens with its fax, metrics parse", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/queue");
  const rows = page.locator('[data-testid="queue-row"]');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await rows.first().click();
  await expect(page.locator("[data-field]").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fax-stage").locator("img")).toHaveJSProperty("complete", true);

  await page.goto("/metrics");
  await expect(page.getByTestId("hero-stat")).toBeVisible({ timeout: 30_000 });
  expect(errors.filter((e) => e.includes("contract violation"))).toEqual([]);
});
