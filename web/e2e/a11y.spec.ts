import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { field, open } from "./helpers";

const scan = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

type Violations = Awaited<ReturnType<typeof scan>>["violations"];
const summarize = (v: Violations) =>
  v.map(
    (x) =>
      `${x.id} (${x.impact}): ${x.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );

for (const [name, path, ready] of [
  ["queue", "/queue", '[data-testid="queue-row"]'],
  ["order", "/orders/ord_smudged", '[data-field="drug.strength"]'],
  ["metrics", "/metrics", '[data-testid="hero-stat"]'],
] as const) {
  test(`no WCAG A/AA violations: ${name}`, async ({ page }) => {
    await open(page, path, ready);
    await page.waitForTimeout(500);
    const { violations } = await scan(page);
    expect(summarize(violations)).toEqual([]);
  });
}

test("no WCAG A/AA violations: field drawer open", async ({ page }) => {
  await open(page, "/orders/ord_smudged", '[data-field="drug.strength"]');
  await field(page, "drug.strength").click();
  await expect(page.getByTestId("field-drawer")).toBeVisible();
  const { violations } = await scan(page);
  expect(summarize(violations)).toEqual([]);
});
