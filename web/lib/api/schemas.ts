import { z } from "zod";
import type * as T from "./types";

// zod mirrors of ./types. The drift guards at the bottom keep the two in lockstep at compile time.

export const triage = z.enum(["green", "yellow", "red"]);
export const orderStatus = z.enum(["processing", "needs_review", "blocked", "ready", "approved", "rejected"]);
export const readSource = z.enum([
  "model_a",
  "model_b",
  "model_c",
  "textract",
  "pharmacist",
  "prescriber_call",
]);

const unit = z.number().min(0).max(1);

export const evidence = z.object({
  page: z.number().int().min(1),
  bbox: z.tuple([unit, unit, unit, unit]),
  text_seen: z.string(),
});

export const read = z.object({
  source: readSource,
  model: z.string().nullish(),
  value: z.string().nullable(),
  evidence: evidence.nullable(),
  ocr_confidence: z.number().min(0).max(100).nullable(),
  crop_url: z.string().nullish(),
  call_id: z.string().nullish(),
});

export const check = z.object({
  rule: z.string(),
  result: z.enum(["pass", "warn", "fail"]),
  severity: z.enum(["red", "yellow", "info"]),
  fields: z.array(z.string()),
  reason: z.string(),
});

export const field = z.object({
  name: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  normalized: z.record(z.unknown()).nullable(),
  reads: z.array(read),
  checks: z.array(check),
  confidence: unit,
  triage,
  reasons: z.array(z.string()),
  risk: z.enum(["high", "normal"]),
  resolution: z
    .object({
      by: z.enum(["pharmacist", "prescriber_call"]),
      action: z.enum(["accept", "edit"]),
      at: z.string(),
      user: z.string().optional(),
    })
    .nullable(),
});

const fieldMap = z.record(field);
const counts = z.object({ red: z.number().int(), yellow: z.number().int(), green: z.number().int() });

export const order = z.object({
  order_id: z.string(),
  fax_id: z.string(),
  page: z.number().int().min(1),
  page_count: z.number().int().min(1),
  received_at: z.string(),
  status: orderStatus,
  fields: z.object({
    patient: fieldMap,
    drug: fieldMap,
    sig: fieldMap,
    prescriber: fieldMap,
    meta: fieldMap,
  }),
  counts,
  trace_url: z.string().nullable(),
  safety_notices: z.array(
    z.object({ title: z.string(), url: z.string(), source: z.string(), date: z.string().optional() }),
  ),
  active_call_id: z.string().nullable(),
  audit: z.array(
    z.object({
      at: z.string(),
      actor: z.string(),
      action: z.string(),
      field: z.string().optional(),
      detail: z.string().optional(),
    }),
  ),
});

export const orderSummary = z.object({
  order_id: z.string(),
  fax_id: z.string(),
  received_at: z.string(),
  status: orderStatus,
  patient_initials: z.string().nullable(),
  drug_display: z.string().nullable(),
  prescriber_display: z.string().nullable(),
  counts,
  has_high_risk_flag: z.boolean(),
});

export const callStatus = z.enum(["queued", "dialing", "in_progress", "completed", "no_answer", "failed"]);

export const call = z.object({
  call_id: z.string(),
  order_id: z.string(),
  field_name: z.string(),
  status: callStatus,
  to_number: z.string(),
  number_source: z.object({
    kind: z.enum(["fax_header", "npi_registry", "tavily"]),
    detail: z.string(),
    agreement: z.boolean(),
  }),
  question: z.string(),
  transcript: z.array(z.object({ role: z.enum(["agent", "office"]), text: z.string(), t: z.number() })),
  result: z
    .object({
      outcome: z.enum(["confirmed", "unclear", "refused"]),
      confirmed_value: z.string().nullable(),
      confirmed_by: z.string().nullable(),
      notes: z.string().nullable(),
    })
    .nullable(),
  decision: z.enum(["accept", "reject"]).nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  error: z.string().nullable(),
});

export const metrics = z.object({
  split: z.literal("held_out"),
  n_faxes: z.number().int(),
  n_fields: z.number().int(),
  systems: z.array(
    z.object({
      name: z.string(),
      silent_error_rate: z.number(),
      field_accuracy: z.number(),
      flag_rate: z.number(),
      flag_precision: z.number(),
      trap_catch_rate: z.number(),
      ece: z.number(),
      cost_per_fax_usd: z.number(),
      p50_latency_s: z.number(),
    }),
  ),
  tradeoff: z.array(
    z.object({ threshold: z.number(), flag_rate: z.number(), silent_error_rate: z.number() }),
  ),
  reliability: z.array(z.object({ bin_mid: z.number(), accuracy: z.number(), count: z.number() })),
  generated_at: z.string(),
});

export const wsEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("order.created"), order: orderSummary }),
  z.object({ type: z.literal("order.updated"), order: orderSummary }),
  z.object({ type: z.literal("call.updated"), call }),
]);

export const orderSummaries = z.array(orderSummary);
export const uploadResponse = z.object({ fax_id: z.string(), order_ids: z.array(z.string()) });
export const approveResponse = z.object({ order, fhir: z.record(z.unknown()) });
export const fhirBundle = z.record(z.unknown());
export const redFieldsError = z.object({ error: z.literal("red_fields"), fields: z.array(z.string()) });

// Compile-time drift guards between zod and the hand-written contract types.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _DriftGuards = [
  Assert<Same<z.infer<typeof order>, T.Order>>,
  Assert<Same<z.infer<typeof orderSummary>, T.OrderSummary>>,
  Assert<Same<z.infer<typeof call>, T.Call>>,
  Assert<Same<z.infer<typeof metrics>, T.Metrics>>,
  Assert<Same<z.infer<typeof uploadResponse>, T.UploadResponse>>,
];
