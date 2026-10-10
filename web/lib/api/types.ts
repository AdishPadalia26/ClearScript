// Mirror of the shared API contract (CLAUDE_CODE_person3_console.md §4.2). Do not change unilaterally.

export type Triage = "green" | "yellow" | "red";
export type OrderStatus = "processing" | "needs_review" | "blocked" | "ready" | "approved" | "rejected";
export type ReadSource = "model_a" | "model_b" | "model_c" | "textract" | "pharmacist" | "prescriber_call";

export interface Evidence {
  page: number; // 1-indexed
  bbox: [number, number, number, number]; // x0,y0,x1,y1 normalized 0..1 of the ORIGINAL page
  text_seen: string;
}

export interface Read {
  source: ReadSource;
  model?: string | null;
  value: string | null;
  evidence: Evidence | null;
  ocr_confidence: number | null; // 0..100, textract only
  crop_url?: string | null;
  call_id?: string | null;
}

export interface Check {
  rule: string;
  result: "pass" | "warn" | "fail";
  severity: "red" | "yellow" | "info";
  fields: string[];
  reason: string;
}

export interface Resolution {
  by: "pharmacist" | "prescriber_call";
  action: "accept" | "edit";
  at: string;
  user?: string;
}

export interface Field {
  name: string;
  label: string;
  value: string | null;
  normalized: Record<string, unknown> | null;
  reads: Read[];
  checks: Check[];
  confidence: number; // 0..1 calibrated
  triage: Triage;
  reasons: string[];
  risk: "high" | "normal";
  resolution: null | Resolution;
}

export type Group = "patient" | "drug" | "sig" | "prescriber" | "meta";

export interface SafetyNotice {
  title: string;
  url: string;
  source: string;
  date?: string;
}

export interface Counts {
  red: number;
  yellow: number;
  green: number;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  field?: string;
  detail?: string;
}

export interface Order {
  order_id: string;
  fax_id: string;
  page: number;
  page_count: number;
  received_at: string;
  status: OrderStatus;
  fields: Record<Group, Record<string, Field>>;
  counts: Counts;
  trace_url: string | null;
  safety_notices: SafetyNotice[];
  active_call_id: string | null;
  audit: AuditEntry[];
}

export interface OrderSummary {
  order_id: string;
  fax_id: string;
  received_at: string;
  status: OrderStatus;
  patient_initials: string | null;
  drug_display: string | null;
  prescriber_display: string | null;
  counts: Counts;
  has_high_risk_flag: boolean;
}

export type CallStatus = "queued" | "dialing" | "in_progress" | "completed" | "no_answer" | "failed";

export interface TranscriptLine {
  role: "agent" | "office";
  text: string;
  t: number;
}

export interface CallResult {
  outcome: "confirmed" | "unclear" | "refused";
  confirmed_value: string | null;
  confirmed_by: string | null;
  notes: string | null;
}

export interface Call {
  call_id: string;
  order_id: string;
  field_name: string;
  status: CallStatus;
  to_number: string;
  number_source: { kind: "fax_header" | "npi_registry" | "tavily"; detail: string; agreement: boolean };
  question: string;
  transcript: TranscriptLine[];
  result: null | CallResult;
  decision: null | "accept" | "reject";
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
}

export interface SystemMetrics {
  name: string; // "clearscript" | "naive" | ablations
  silent_error_rate: number;
  field_accuracy: number;
  flag_rate: number;
  flag_precision: number;
  trap_catch_rate: number;
  ece: number;
  cost_per_fax_usd: number;
  p50_latency_s: number;
}

export interface Metrics {
  split: "held_out";
  n_faxes: number;
  n_fields: number;
  systems: SystemMetrics[];
  tradeoff: { threshold: number; flag_rate: number; silent_error_rate: number }[];
  reliability: { bin_mid: number; accuracy: number; count: number }[];
  generated_at: string;
}

export type WsEvent =
  { type: "order.created" | "order.updated"; order: OrderSummary } | { type: "call.updated"; call: Call };

// Request / response envelopes
export interface UploadResponse {
  fax_id: string;
  order_ids: string[];
}
export interface ApproveResponse {
  order: Order;
  fhir: Record<string, unknown>;
}
export type ResolveBody = { action: "accept" } | { action: "edit"; value: string };
