import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as s from "@/lib/api/schemas";

// The backend workstream's contract fixtures must parse with the console's zod schemas,
// otherwise live mode would reject them. Skips if the shared fixtures aren't checked out.
// Vitest runs from web/ (jsdom swaps URL, so avoid fileURLToPath at module scope).
const dir = resolve(process.cwd(), "../contracts/fixtures") + "/";
const cases = [
  ["order-clean.json", s.order],
  ["order-smudged.json", s.order],
  ["order-controlled.json", s.order],
  ["call-completed-confirmed.json", s.call],
  ["call-no-answer.json", s.call],
  ["metrics.json", s.metrics],
] as const;

describe.skipIf(!existsSync(dir))("contracts/fixtures parse with web schemas", () => {
  it.each(cases)("%s", (file, schema) => {
    const res = schema.safeParse(JSON.parse(readFileSync(dir + file, "utf8")));
    expect(res.success ? [] : res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  });
});
