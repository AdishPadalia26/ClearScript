import type { Metrics, SystemMetrics } from "@/lib/api/types";

export const SYSTEM_LABEL: Record<string, string> = {
  clearscript: "ClearScript",
  naive: "Naive pipeline",
  no_ensemble: "Without the 3-model ensemble",
  no_ocr: "Without OCR pass",
  no_registry: "Without registry checks",
  no_rules: "Without safety rules",
};
export const systemLabel = (name: string) => SYSTEM_LABEL[name] ?? name.replace(/_/g, " ");

export const getSystem = (m: Metrics, name: string): SystemMetrics | undefined =>
  m.systems.find((s) => s.name === name);

/** The tradeoff point nearest ClearScript's reported operating point (the contract has no threshold field). */
export function operatingPoint(m: Metrics) {
  const cs = getSystem(m, "clearscript");
  if (!cs || !m.tradeoff.length) return null;
  let best = m.tradeoff[0]!;
  let bestD = Infinity;
  for (const p of m.tradeoff) {
    const d = (p.flag_rate - cs.flag_rate) ** 2 + ((p.silent_error_rate - cs.silent_error_rate) * 10) ** 2;
    if (d < bestD) [best, bestD] = [p, d];
  }
  return { ...best, flag_rate: cs.flag_rate, silent_error_rate: cs.silent_error_rate };
}

/** "15× fewer" style ratio; null when it isn't meaningful. */
export function improvement(baseline: number, ours: number): number | null {
  if (!(baseline > 0) || !(ours > 0)) return null;
  return baseline / ours;
}
