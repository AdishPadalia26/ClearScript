import { expect, type Page } from "@playwright/test";

/** Opens a page and waits for MSW + first data. */
export async function open(page: Page, path: string, ready: string) {
  await page.goto(path);
  await expect(page.locator(ready).first()).toBeVisible({ timeout: 60_000 });
}

export const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);

/** A 1×1 PNG, enough to exercise the upload path. */
export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
