import type {
  Counts,
  Field,
  Group,
  Order,
  OrderStatus,
  OrderSummary,
  Read,
  Resolution,
} from "@/lib/api/types";

/** Display order for the field panel: drug first (highest risk), meta last. */
export const SECTION_ORDER: readonly { group: Group; title: string }[] = [
  { group: "drug", title: "Drug" },
  { group: "sig", title: "Directions" },
  { group: "patient", title: "Patient" },
  { group: "prescriber", title: "Prescriber" },
  { group: "meta", title: "Meta" },
];

export interface FieldRef {
  group: Group;
  field: Field;
}

/** All fields in display order. */
export function orderedFields(order: Order): FieldRef[] {
  const out: FieldRef[] = [];
  for (const { group } of SECTION_ORDER) {
    for (const field of Object.values(order.fields[group] ?? {})) out.push({ group, field });
  }
  return out;
}

export function findField(order: Order, name: string): FieldRef | null {
  for (const { group } of SECTION_ORDER) {
    const field = order.fields[group]?.[name];
    if (field) return { group, field };
  }
  return null;
}

export const isFlagged = (f: Field) => f.triage !== "green";

const MACHINE_SOURCES = new Set<Read["source"]>(["model_a", "model_b", "model_c", "ocr"]);
const norm = (v: string | null) => (v == null ? null : v.trim().replace(/\s+/g, " ").toLowerCase());

/** Most common machine-read value (normalized). Ties go to the earliest read. */
export function majorityValue(reads: Read[]): string | null {
  const tally = new Map<string, number>();
  let best: string | null = null;
  let bestN = 0;
  for (const r of reads) {
    if (!MACHINE_SOURCES.has(r.source)) continue;
    const v = norm(r.value);
    if (v == null) continue;
    const n = (tally.get(v) ?? 0) + 1;
    tally.set(v, n);
    if (n > bestN) [best, bestN] = [v, n];
  }
  return best;
}

/** True when a machine read disagrees with the majority (null reads count as disagreeing). */
export function disagrees(read: Read, majority: string | null): boolean {
  if (!MACHINE_SOURCES.has(read.source) || majority == null) return false;
  return norm(read.value) !== majority;
}

/** The read whose box represents the field on the fax: the majority read that has evidence. */
export function primaryEvidenceRead(field: Field): Read | null {
  const majority = majorityValue(field.reads);
  let fallback: Read | null = null;
  for (const r of field.reads) {
    if (!r.evidence) continue;
    if (norm(r.value) === majority) return r;
    fallback ??= r;
  }
  return fallback;
}

export function countTriage(order: Order): Counts {
  const c: Counts = { red: 0, yellow: 0, green: 0 };
  for (const g of Object.values(order.fields)) for (const f of Object.values(g)) c[f.triage]++;
  return c;
}

export function deriveStatus(status: OrderStatus, counts: Counts): OrderStatus {
  if (status === "approved" || status === "rejected" || status === "processing") return status;
  return counts.red > 0 ? "blocked" : counts.yellow > 0 ? "needs_review" : "ready";
}

export function withRecount(order: Order): Order {
  const counts = countTriage(order);
  return { ...order, counts, status: deriveStatus(order.status, counts) };
}

function patchField(order: Order, name: string, patch: (f: Field) => Field): Order {
  const ref = findField(order, name);
  if (!ref) return order;
  const group = order.fields[ref.group];
  return withRecount({
    ...order,
    fields: { ...order.fields, [ref.group]: { ...group, [name]: patch(ref.field) } },
  });
}

/**
 * Applies a pharmacist (or accepted prescriber-call) resolution. Shared by optimistic updates
 * and the mock server so the two can't disagree about what "resolved" looks like.
 */
export function applyResolution(
  order: Order,
  name: string,
  res: { action: "accept" | "edit"; value?: string; by?: Resolution["by"]; user?: string; callId?: string },
  at = new Date().toISOString(),
): Order {
  const by = res.by ?? "pharmacist";
  return patchField(order, name, (f) => {
    const value = res.action === "edit" && res.value !== undefined ? res.value : f.value;
    const reads =
      by === "pharmacist" && res.action === "edit"
        ? [...f.reads, { source: "pharmacist" as const, value, evidence: null, ocr_confidence: null }]
        : f.reads;
    return {
      ...f,
      value,
      reads,
      triage: "green",
      confidence: 1,
      resolution: { by, action: res.action, at, ...(res.user ? { user: res.user } : {}) },
    };
  });
}

export function toSummary(order: Order): OrderSummary {
  const v = (g: Group, n: string) => order.fields[g]?.[n]?.value ?? null;
  const name = v("patient", "patient.name");
  const initials = name
    ? name
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((p) => p[0]!.toUpperCase())
        .join(".") + "."
    : null;
  const drug = [v("drug", "drug.name"), v("drug", "drug.strength")].filter(Boolean).join(" ") || null;
  const hasHighRisk = orderedFields(order).some(
    ({ field }) => field.risk === "high" && field.triage !== "green",
  );
  return {
    order_id: order.order_id,
    fax_id: order.fax_id,
    received_at: order.received_at,
    status: order.status,
    patient_initials: initials,
    drug_display: drug,
    prescriber_display: v("prescriber", "prescriber.name"),
    counts: order.counts,
    has_high_risk_flag: hasHighRisk,
  };
}

const STATUS_RANK: Record<OrderStatus, number> = {
  blocked: 0,
  needs_review: 1,
  ready: 2,
  processing: 3,
  approved: 4,
  rejected: 5,
};

/** Queue sort: blocked → needs review → ready → processing → done; oldest first within a status. */
export function compareQueue(a: OrderSummary, b: OrderSummary): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.received_at.localeCompare(b.received_at);
}

export const canBulkApprove = (o: OrderSummary) => o.status === "ready" && !o.has_high_risk_flag;

/** Distinct values the readers produced, in read order. */
export const candidateValues = (f: Field) => [
  ...new Set(f.reads.map((r) => r.value).filter((v): v is string => !!v)),
];

/**
 * The question the voice agent asks. Mirrors the backend's prompt so the pre-call card can show it
 * before dialing (see BACKEND_REQUESTS.md: call preview endpoint).
 */
export function callQuestion(order: Order, f: Field): string {
  const initials = toSummary(order).patient_initials ?? "the patient";
  const drug = findField(order, "drug.name")?.field.value ?? "the";
  const cands = candidateValues(f).join(" or ");
  return `Can you confirm the ${f.label.toLowerCase()} for ${initials}'s ${drug} prescription? The fax reads ${cands || "unclear"}.`;
}
