import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("metrics page renders all four blocks and the MOCK label", async ({ page }) => {
  await open(page, "/metrics", '[data-testid="hero-stat"]');
  await expect(page.getByTestId("mock-label")).toBeVisible();
  await expect(page.getByTestId("naive-card")).toContainText("850 mg");
  await expect(page.getByTestId("hero-stat")).toContainText("0.4%");
  await expect(page.getByTestId("tradeoff").locator(".recharts-surface")).toBeVisible();
  await expect(page.getByTestId("tradeoff")).toContainText("Chosen threshold 0.85");
  await expect(page.getByTestId("reliability")).toContainText("ECE");
  await expect(page.getByTestId("ablation-table").locator("tbody tr")).toHaveCount(6);
  await expect(page.getByText(/Synthetic benchmark, held-out split/)).toBeVisible();
});
