import type { Call, Order, WsEvent } from "@/lib/api/types";
import { applyResolution, callQuestion, findField, orderedFields, toSummary, withRecount } from "@/lib/order";
import { env } from "@/lib/env";
import { faxSvg, type FaxSpec } from "./fax";
import { buildScenarios, type Scenario } from "./fixtures/orders";
import { mockFhir } from "./fhir";

// In-memory backend for mock mode. Every mutation replaces objects (never mutates in place) so
// TanStack Query's structural sharing sees real changes.

type Emit = (ev: WsEvent) => void;

interface State {
  orders: Map<string, Order>;
  faxes: Map<string, FaxSpec>;
  callAnswers: Map<string, Record<string, string>>;
  calls: Map<string, Call>;
  timers: Set<ReturnType<typeof setTimeout>>;
  seq: number;
}

let state: State;
let emit: Emit = () => {};

export const setEmitter = (fn: Emit) => void (emit = fn);

function load(scenarios: Scenario[]) {
  for (const s of scenarios) {
    state.orders.set(s.order.order_id, s.order);
    state.faxes.set(s.order.fax_id, s.fax);
    state.callAnswers.set(s.order.order_id, s.callAnswers);
  }
}

export function resetDb() {
  state?.timers.forEach(clearTimeout);
  state = {
    orders: new Map(),
    faxes: new Map(),
    callAnswers: new Map(),
    calls: new Map(),
    timers: new Set(),
    seq: 0,
  };
  load(buildScenarios());
}
resetDb();

function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    state.timers.delete(t);
    fn();
  }, ms);
  state.timers.add(t);
}

function save(order: Order, type: "order.created" | "order.updated" = "order.updated") {
  state.orders.set(order.order_id, order);
  emit({ type, order: toSummary(order) });
  return order;
}

const audit = (o: Order, action: string, extra: { field?: string; detail?: string } = {}): Order => ({
  ...o,
  audit: [...o.audit, { at: new Date().toISOString(), actor: "pharmacist (demo)", action, ...extra }],
});

export const db = {
  listOrders: (status?: string) =>
    [...state.orders.values()].filter((o) => !status || o.status === status).map(toSummary),

  getOrder: (id: string) => state.orders.get(id) ?? null,

  faxPage: (faxId: string) => {
    const spec = state.faxes.get(faxId);
    return spec ? faxSvg(spec) : null;
  },

  resolve(orderId: string, field: string, body: { action: "accept" | "edit"; value?: string }) {
    const o = state.orders.get(orderId);
    if (!o || !findField(o, field)) return null;
    return save(
      audit(applyResolution(o, field, { ...body, user: "demo" }), `field.${body.action}`, {
        field,
        detail: body.value,
      }),
    );
  },

  approve(orderId: string): { order: Order; fhir: Record<string, unknown> } | { red: string[] } | null {
    const o = state.orders.get(orderId);
    if (!o) return null;
    const red = orderedFields(o)
      .filter(({ field }) => field.triage === "red")
      .map(({ field }) => field.name);
    if (red.length) return { red };
    const at = new Date().toISOString();
    const order = save(audit({ ...o, status: "approved", active_call_id: null }, "order.approved"));
    return { order, fhir: mockFhir(order, at) };
  },

  reject(orderId: string, reason: string) {
    const o = state.orders.get(orderId);
    if (!o) return null;
    return save(
      audit({ ...o, status: "rejected", active_call_id: null }, "order.rejected", { detail: reason }),
    );
  },

  fhir: (orderId: string) => {
    const o = state.orders.get(orderId);
    return o?.status === "approved" ? mockFhir(o, o.audit.at(-1)?.at ?? new Date().toISOString()) : null;
  },

  upload(fileName: string) {
    const n = ++state.seq;
    const templates = buildScenarios();
    const tpl = templates[n % 2 === 1 ? 1 : 0]!; // alternate smudged / clean
    const id = `ord_up${n}`;
    const faxId = `fax_up${n}`;
    const now = new Date().toISOString();
    const processing: Order = {
      ...tpl.order,
      order_id: id,
      fax_id: faxId,
      received_at: now,
      status: "processing",
      fields: { patient: {}, drug: {}, sig: {}, prescriber: {}, meta: {} },
      counts: { red: 0, yellow: 0, green: 0 },
      audit: [{ at: now, actor: "system", action: "fax.received", detail: fileName }],
    };
    state.faxes.set(faxId, tpl.fax);
    state.callAnswers.set(id, tpl.callAnswers);
    save(processing, "order.created");
    later(3500, () =>
      save(
        withRecount({ ...tpl.order, order_id: id, fax_id: faxId, received_at: now, audit: processing.audit }),
      ),
    );
    return { fax_id: faxId, order_ids: [id] };
  },

  startCall(orderId: string, fieldName: string): Call | "busy" | null {
    const o = state.orders.get(orderId);
    const ref = o && findField(o, fieldName);
    if (!o || !ref) return null;
    const active = o.active_call_id ? state.calls.get(o.active_call_id) : null;
    if (active && !["completed", "no_answer", "failed"].includes(active.status)) return "busy";

    const v = (n: string) => findField(o, n)?.field.value ?? "";
    const prescriber = v("prescriber.name") || "the prescriber";
    const initials = toSummary(o).patient_initials ?? "the patient";
    const answer = state.callAnswers.get(orderId)?.[fieldName] ?? ref.field.value ?? "";
    const question = callQuestion(o, ref.field);
    const callId = `call_${++state.seq}`;
    const phone = v("prescriber.phone") || "(212) 555-0100";

    let call: Call = {
      call_id: callId,
      order_id: orderId,
      field_name: fieldName,
      status: "queued",
      to_number: `+1 ${phone}`,
      number_source: {
        kind: "npi_registry",
        detail: `NPPES practice phone matches fax header ${phone}`,
        agreement: true,
      },
      question,
      transcript: [],
      result: null,
      decision: null,
      started_at: null,
      ended_at: null,
      error: null,
    };
    const put = (patch: Partial<Call>) => {
      call = { ...call, ...patch };
      state.calls.set(callId, call);
      emit({ type: "call.updated", call });
    };
    state.calls.set(callId, call);
    save({ ...o, active_call_id: callId });

    const script: [Call["transcript"][number]["role"], string][] = [
      [
        "agent",
        `Hi, this is the automated assistant for ${env.pharmacyName}, calling about a prescription from ${prescriber} for patient ${initials}. Do you have a moment?`,
      ],
      ["office", "Sure, this is Maria at the front desk. Go ahead."],
      ["agent", question],
      ["office", `One second, let me pull the chart… Okay, it's ${answer}.`],
      ["agent", `Thank you. To confirm, the ${ref.field.label.toLowerCase()} is ${answer}. Is that correct?`],
      ["office", "Yes, that's right."],
      ["agent", "Thank you, Maria. Have a good day."],
    ];

    later(1000, () => put({ status: "dialing" }));
    later(3000, () => {
      const started = new Date().toISOString();
      put({ status: "in_progress", started_at: started });
      script.forEach(([role, text], i) =>
        later(1500 * (i + 1), () =>
          put({
            transcript: [...call.transcript, { role, text, t: (Date.now() - Date.parse(started)) / 1000 }],
          }),
        ),
      );
      later(1500 * (script.length + 1), () => {
        put({
          status: "completed",
          ended_at: new Date().toISOString(),
          result: {
            outcome: "confirmed",
            confirmed_value: answer,
            confirmed_by: "Maria, front desk",
            notes: null,
          },
        });
        // Attach the answer as a prescriber_call read; the field stays flagged until the pharmacist accepts.
        const cur = state.orders.get(orderId)!;
        const f = findField(cur, fieldName)!;
        const read = {
          source: "prescriber_call" as const,
          value: answer,
          evidence: null,
          ocr_confidence: null,
          call_id: callId,
        };
        save({
          ...cur,
          fields: {
            ...cur.fields,
            [f.group]: {
              ...cur.fields[f.group],
              [fieldName]: { ...f.field, reads: [...f.field.reads, read] },
            },
          },
        });
      });
    });
    return call;
  },

  getCall: (id: string) => state.calls.get(id) ?? null,

  decide(callId: string, decision: "accept" | "reject") {
    const call = state.calls.get(callId);
    const o = call && state.orders.get(call.order_id);
    if (!call || !o) return null;
    const next = { ...call, decision };
    state.calls.set(callId, next);
    emit({ type: "call.updated", call: next });
    const cleared = { ...o, active_call_id: null };
    if (decision === "accept" && call.result?.confirmed_value) {
      return save(
        audit(
          applyResolution(cleared, call.field_name, {
            action: "edit",
            value: call.result.confirmed_value,
            by: "prescriber_call",
            user: call.result.confirmed_by ?? undefined,
          }),
          "call.accepted",
          { field: call.field_name, detail: call.result.confirmed_value },
        ),
      );
    }
    return save(audit(cleared, "call.rejected", { field: call.field_name }));
  },
};
