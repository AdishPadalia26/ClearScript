import { expect, test } from "@playwright/test";
import { field, open } from "./helpers";

test("call flow: confirm → start → transcript → accept → field green → approve", async ({ page }) => {
  await open(page, "/orders/ord_smudged", '[data-field="drug.strength"]');
  await field(page, "drug.strength").click();
  await page.keyboard.press("c");

  // Nothing dials until the pharmacist confirms.
  const pre = page.getByTestId("precall");
  await expect(pre).toContainText("Shares patient initials only");
  await expect(pre).toContainText("(•••) •••-0187");
  await pre.getByRole("button", { name: "Start call" }).click();

  await expect(page.getByTestId("call-chip")).toBeVisible();
  await expect(page.getByTestId("transcript")).toContainText("Maria", { timeout: 15_000 });
  const result = page.getByTestId("call-result");
  await expect(result).toContainText("500 mg", { timeout: 20_000 });

  // Still red until the pharmacist accepts the answer.
  await expect(field(page, "drug.strength")).toHaveAttribute("data-triage", "red");
  await result.getByRole("button", { name: "Accept answer" }).click();
  await expect(field(page, "drug.strength")).toHaveAttribute("data-triage", "green");
  await expect(field(page, "drug.strength")).toContainText("Confirmed by office");

  await page.keyboard.press("Escape");
  await page.getByTestId("approve").click();
  await page.getByTestId("confirm-approve").click();
  await expect(page.getByTestId("fhir-modal")).toBeVisible();
});
