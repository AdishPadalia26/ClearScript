import type { CallStatus, OrderStatus, ReadSource } from "@/lib/api/types";

/** Masks all but the last 4 digits: "+1 (212) 555-0142" → "(•••) •••-0142". */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `(•••) •••-${digits.slice(-4)}`;
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  if (!Number.isFinite(diff)) return "—";
  if (Math.abs(diff) < 10) return "just now";
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs || unit === "second") return rtf!.format(Math.round(diff / secs), unit);
  }
  return "—";
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

export function elapsed(fromIso: string | null, toIso: string | null, now = Date.now()): string {
  if (!fromIso) return "0:00";
  const ms = (toIso ? new Date(toIso).getTime() : now) - new Date(fromIso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const SOURCE_LABEL: Record<ReadSource, string> = {
  model_a: "Model A",
  model_b: "Model B",
  model_c: "Model C",
  ocr: "OCR",
  pharmacist: "Pharmacist",
  prescriber_call: "Prescriber call",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  processing: "Processing",
  needs_review: "Needs review",
  blocked: "Blocked",
  ready: "Ready",
  approved: "Approved",
  rejected: "Rejected",
};

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  queued: "Queued",
  dialing: "Dialing",
  in_progress: "Connected",
  completed: "Done",
  no_answer: "No answer",
  failed: "Failed",
};

export const NUMBER_SOURCE_LABEL = {
  fax_header: "Fax header",
  npi_registry: "NPI Registry",
  tavily: "Web lookup (Tavily)",
} as const;
