import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("contracts/types.ts mirror", () => {
  it("matches web/lib/api/types.ts (below its generated header)", () => {
    const mirror = read("../../contracts/types.ts").split("\n").slice(3).join("\n");
    expect(mirror).toBe(read("../lib/api/types.ts"));
  });
});
