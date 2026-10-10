import type { Metrics } from "@/lib/api/types";

/** Plausible, clearly-fabricated benchmark numbers. The UI labels these MOCK in mock mode. */
export const OPERATING_THRESHOLD = 0.85;

export const mockMetrics: Metrics = {
  split: "held_out",
  n_faxes: 240,
  n_fields: 4320,
  systems: [
    {
      name: "clearscript",
      silent_error_rate: 0.004,
      field_accuracy: 0.981,
      flag_rate: 0.142,
      flag_precision: 0.61,
      trap_catch_rate: 0.96,
      ece: 0.028,
      cost_per_fax_usd: 0.042,
      p50_latency_s: 7.8,
    },
    {
      name: "naive",
      silent_error_rate: 0.061,
      field_accuracy: 0.939,
      flag_rate: 0,
      flag_precision: 0,
      trap_catch_rate: 0.12,
      ece: 0.214,
      cost_per_fax_usd: 0.008,
      p50_latency_s: 2.1,
    },
    {
      name: "no_ensemble",
      silent_error_rate: 0.019,
      field_accuracy: 0.962,
      flag_rate: 0.118,
      flag_precision: 0.49,
      trap_catch_rate: 0.71,
      ece: 0.067,
      cost_per_fax_usd: 0.016,
      p50_latency_s: 3.9,
    },
    {
      name: "no_textract",
      silent_error_rate: 0.008,
      field_accuracy: 0.976,
      flag_rate: 0.151,
      flag_precision: 0.55,
      trap_catch_rate: 0.9,
      ece: 0.041,
      cost_per_fax_usd: 0.037,
      p50_latency_s: 6.9,
    },
    {
      name: "no_registry",
      silent_error_rate: 0.013,
      field_accuracy: 0.968,
      flag_rate: 0.129,
      flag_precision: 0.52,
      trap_catch_rate: 0.83,
      ece: 0.052,
      cost_per_fax_usd: 0.04,
      p50_latency_s: 7.1,
    },
    {
      name: "no_rules",
      silent_error_rate: 0.021,
      field_accuracy: 0.979,
      flag_rate: 0.097,
      flag_precision: 0.58,
      trap_catch_rate: 0.44,
      ece: 0.031,
      cost_per_fax_usd: 0.042,
      p50_latency_s: 7.6,
    },
  ],
  // Monotone curve; the 0.85 point is exactly ClearScript's reported operating point.
  tradeoff: (
    [
      [0.5, 0.03, 0.036],
      [0.6, 0.048, 0.021],
      [0.7, 0.078, 0.012],
      [0.75, 0.098, 0.0082],
      [0.8, 0.118, 0.0058],
      [OPERATING_THRESHOLD, 0.142, 0.004],
      [0.9, 0.181, 0.0028],
      [0.93, 0.214, 0.0022],
      [0.96, 0.262, 0.0018],
      [0.99, 0.348, 0.0015],
    ] as const
  ).map(([threshold, flag_rate, silent_error_rate]) => ({ threshold, flag_rate, silent_error_rate })),
  reliability: [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95].map((bin_mid, i) => ({
    bin_mid,
    accuracy: +Math.min(
      1,
      bin_mid + [0.04, -0.03, 0.05, -0.02, 0.03, -0.04, 0.02, -0.01, 0.01, 0.02][i]!,
    ).toFixed(3),
    count: [12, 18, 25, 31, 44, 62, 118, 240, 610, 3160][i]!,
  })),
  generated_at: "2026-10-09T22:14:00Z",
};
