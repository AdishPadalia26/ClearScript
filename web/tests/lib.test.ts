import { describe, expect, it } from "vitest";
import { bboxToStyle, cropRect } from "@/lib/geometry";
import { elapsed, maskPhone, relativeTime } from "@/lib/format";
import { matchHotkey, isTypingTarget } from "@/lib/keyboard";
import {
  applyResolution,
  callQuestion,
  canBulkApprove,
  compareQueue,
  countTriage,
  deriveStatus,
  disagrees,
  findField,
  majorityValue,
  orderedFields,
  primaryEvidenceRead,
  toSummary,
} from "@/lib/order";
import { backoffDelay } from "@/lib/realtime";
import { improvement, operatingPoint } from "@/lib/metrics";
import { buildScenarios } from "@/mocks/fixtures/orders";
import { mockMetrics } from "@/mocks/fixtures/metrics";
import type { OrderSummary, Read } from "@/lib/api/types";

const scen = () => Object.fromEntries(buildScenarios().map((s) => [s.order.order_id, s.order]));

describe("bboxToStyle", () => {
  it("maps normalized coords to percentages", () => {
    const s = bboxToStyle([0.1, 0.2, 0.4, 0.25]);
    expect(s.left).toBe("10%");
    expect(s.top).toBe("20%");
    expect(parseFloat(s.width)).toBeCloseTo(30);
    expect(parseFloat(s.height)).toBeCloseTo(5);
    expect(s.width.endsWith("%")).toBe(true);
  });
  it("normalizes inverted boxes and clamps to the page", () => {
    const s = bboxToStyle([0.9, 0.5, 1.2, -0.1]);
    expect(s.left).toBe("90%");
    expect(s.top).toBe("0%");
    expect(parseFloat(s.width)).toBeCloseTo(10);
    expect(parseFloat(s.height)).toBeCloseTo(50);
  });
});

describe("cropRect", () => {
  it("pads 8% of the box on each side", () => {
    // 0.5 wide box on a 1000px page → 40px padding each side.
    expect(cropRect([0.25, 0.4, 0.75, 0.6], 1000, 1000)).toEqual({ sx: 210, sy: 384, sw: 580, sh: 232 });
  });
  it("uses a minimum pad of 1% of the page for tiny boxes", () => {
    const r = cropRect([0.5, 0.5, 0.51, 0.51], 1000, 1000);
    expect(r.sx).toBe(490);
    expect(r.sw).toBe(30);
  });
  it("clamps at page edges", () => {
    const r = cropRect([0, 0, 0.2, 0.1], 850, 1100);
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(0);
    const e = cropRect([0.9, 0.95, 1, 1], 850, 1100);
    expect(e.sx + e.sw).toBeLessThanOrEqual(850);
    expect(e.sy + e.sh).toBeLessThanOrEqual(1100);
  });
});

describe("format", () => {
  it("masks phone numbers to the last 4", () => {
    expect(maskPhone("+1 (212) 555-0142")).toBe("(•••) •••-0142");
    expect(maskPhone("2125550142")).toBe("(•••) •••-0142");
    expect(maskPhone("12")).toBe("•••");
  });
  it("formats relative time and elapsed", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    expect(relativeTime("2026-10-10T11:56:00Z", now)).toBe("4 minutes ago");
    expect(relativeTime("2026-10-10T11:59:58Z", now)).toBe("just now");
    expect(elapsed("2026-10-10T11:59:00Z", null, now)).toBe("1:00");
    expect(elapsed(null, null, now)).toBe("0:00");
  });
});

describe("keyboard", () => {
  const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;
  it("matches plain, mod and symbol keys", () => {
    expect(matchHotkey(ev("j"), "j")).toBe(true);
    expect(matchHotkey(ev("J"), "j")).toBe(true);
    expect(matchHotkey(ev("J", { shiftKey: true }), "j")).toBe(false);
    expect(matchHotkey(ev("j", { ctrlKey: true }), "j")).toBe(false);
    expect(matchHotkey(ev("Enter", { ctrlKey: true }), "mod+Enter")).toBe(true);
    expect(matchHotkey(ev("Enter", { metaKey: true }), "mod+Enter")).toBe(true);
    expect(matchHotkey(ev("Enter"), "mod+Enter")).toBe(false);
    expect(matchHotkey(ev("?", { shiftKey: true }), "?")).toBe(true);
  });
  it("detects typing targets", () => {
    const input = document.createElement("input");
    const box = Object.assign(document.createElement("input"), { type: "checkbox" });
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });
});

describe("order logic", () => {
  it("fixtures produce the demo-story counts and statuses", () => {
    const o = scen();
    expect(o.ord_clean!.counts).toMatchObject({ red: 0, yellow: 0 });
    expect(o.ord_clean!.status).toBe("ready");
    expect(o.ord_smudged!.counts).toMatchObject({ red: 1, yellow: 2 });
    expect(o.ord_smudged!.status).toBe("blocked");
    expect(o.ord_controlled!.counts.red).toBe(2);
    expect(o.ord_processing!.status).toBe("processing");
  });

  it("orders fields drug-first", () => {
    const names = orderedFields(scen().ord_clean!).map((r) => r.group);
    expect(names[0]).toBe("drug");
    expect(names.at(-1)).toBe("meta");
  });

  it("finds the majority read and disagreeing reads", () => {
    const f = findField(scen().ord_smudged!, "drug.strength")!.field;
    const maj = majorityValue(f.reads);
    expect(maj).toBe("850 mg");
    const off = f.reads.filter((r) => disagrees(r, maj)).map((r) => r.source);
    expect(off).toEqual(["model_c"]);
    expect(primaryEvidenceRead(f)?.value).toBe("850 mg");
  });

  it("ignores human sources and normalizes whitespace/case for majority", () => {
    const reads: Read[] = [
      { source: "model_a", value: "500  MG", evidence: null, ocr_confidence: null },
      { source: "model_b", value: "500 mg", evidence: null, ocr_confidence: null },
      { source: "pharmacist", value: "850 mg", evidence: null, ocr_confidence: null },
      { source: "pharmacist", value: "850 mg", evidence: null, ocr_confidence: null },
    ];
    expect(majorityValue(reads)).toBe("500 mg");
    expect(disagrees(reads[2]!, "500 mg")).toBe(false);
  });

  it("applies an edit: green, recounted, status unblocked, pharmacist read added", () => {
    const o = applyResolution(
      scen().ord_smudged!,
      "drug.strength",
      { action: "edit", value: "500 mg" },
      "2026-10-10T00:00:00Z",
    );
    const f = findField(o, "drug.strength")!.field;
    expect(f.value).toBe("500 mg");
    expect(f.triage).toBe("green");
    expect(f.resolution).toMatchObject({ by: "pharmacist", action: "edit" });
    expect(f.reads.at(-1)).toMatchObject({ source: "pharmacist", value: "500 mg" });
    expect(o.counts).toEqual(countTriage(o));
    expect(o.counts.red).toBe(0);
    expect(o.status).toBe("needs_review");
  });

  it("does not mutate the input order", () => {
    const before = scen().ord_smudged!;
    const snapshot = JSON.stringify(before);
    applyResolution(before, "drug.strength", { action: "accept" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("derives status from counts, preserving terminal states", () => {
    expect(deriveStatus("needs_review", { red: 1, yellow: 0, green: 3 })).toBe("blocked");
    expect(deriveStatus("blocked", { red: 0, yellow: 1, green: 3 })).toBe("needs_review");
    expect(deriveStatus("blocked", { red: 0, yellow: 0, green: 3 })).toBe("ready");
    expect(deriveStatus("approved", { red: 1, yellow: 0, green: 0 })).toBe("approved");
  });

  it("summarizes orders and gates bulk approve", () => {
    const o = scen();
    const s = toSummary(o.ord_smudged!);
    expect(s.patient_initials).toBe("A.M.T.");
    expect(s.drug_display).toBe("Metformin HCl 850 mg");
    expect(s.has_high_risk_flag).toBe(true);
    expect(canBulkApprove(s)).toBe(false);
    expect(canBulkApprove(toSummary(o.ord_clean!))).toBe(true);
  });

  it("sorts the queue blocked → needs review → ready → processing, oldest first", () => {
    const mk = (status: OrderSummary["status"], at: string) => ({ status, received_at: at }) as OrderSummary;
    const sorted = [
      mk("ready", "1"),
      mk("processing", "0"),
      mk("blocked", "3"),
      mk("needs_review", "2"),
      mk("blocked", "1"),
    ].sort(compareQueue);
    expect(sorted.map((o) => `${o.status}${o.received_at}`)).toEqual([
      "blocked1",
      "blocked3",
      "needs_review2",
      "ready1",
      "processing0",
    ]);
  });

  it("builds the call question with initials only", () => {
    const o = scen().ord_smudged!;
    const q = callQuestion(o, findField(o, "drug.strength")!.field);
    expect(q).toContain("A.M.T.");
    expect(q).toContain("850 mg or 500 mg");
    expect(q).not.toContain("Torres");
  });
});

describe("realtime + metrics helpers", () => {
  it("backs off exponentially from 1 s to a 30 s cap", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
  it("finds the operating point and improvement ratio", () => {
    expect(operatingPoint(mockMetrics)?.threshold).toBe(0.85);
    expect(improvement(0.061, 0.004)).toBeCloseTo(15.25);
    expect(improvement(0, 0.004)).toBeNull();
  });
});
