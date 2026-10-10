import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import {
  useApprove,
  useCall,
  useCallDecision,
  useMetrics,
  useOrder,
  useOrders,
  useReject,
  useResolveField,
  useStartCall,
  useUploadFax,
} from "@/lib/api/hooks";
import { qk } from "@/lib/api/keys";
import { findField } from "@/lib/order";
import { getSocketStatus, useOrdersSocket, useSocketStatus } from "@/lib/realtime";
import { resetDb, setEmitter } from "@/mocks/db";
import { server } from "@/mocks/server";
import type { Order, OrderSummary } from "@/lib/api/types";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const BASE = "http://localhost:8000";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetDb());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("query hooks", () => {
  it("load orders, an order and metrics", async () => {
    const { wrapper } = setup();
    const orders = renderHook(() => useOrders(), { wrapper });
    const order = renderHook(() => useOrder("ord_smudged"), { wrapper });
    const metrics = renderHook(() => useMetrics(), { wrapper });
    await waitFor(() => expect(orders.result.current.data?.length).toBeGreaterThan(4));
    await waitFor(() => expect(order.result.current.data?.counts.red).toBe(1));
    await waitFor(() => expect(metrics.result.current.data?.split).toBe("held_out"));
  });
});

describe("useResolveField", () => {
  it("updates optimistically, then writes the server order into the queue cache", async () => {
    const { qc, wrapper } = setup();
    const order = renderHook(() => useOrder("ord_smudged"), { wrapper });
    const list = renderHook(() => useOrders(), { wrapper });
    await waitFor(() => expect(order.result.current.data).toBeDefined());
    await waitFor(() => expect(list.result.current.data).toBeDefined());

    const m = renderHook(() => useResolveField("ord_smudged"), { wrapper });
    act(() => m.result.current.mutate({ field: "drug.strength", body: { action: "edit", value: "500 mg" } }));
    // Optimistic: green before the server answers.
    await waitFor(() =>
      expect(findField(qc.getQueryData<Order>(qk.order("ord_smudged"))!, "drug.strength")!.field.triage).toBe(
        "green",
      ),
    );
    await waitFor(() => expect(m.result.current.isSuccess).toBe(true));
    const summary = qc.getQueryData<OrderSummary[]>(qk.orders())!.find((o) => o.order_id === "ord_smudged")!;
    expect(summary.counts.red).toBe(0);
    expect(summary.drug_display).toBe("Metformin HCl 500 mg");
  });

  it("rolls back on error", async () => {
    server.use(
      http.post(`${BASE}/orders/:id/fields/:f/resolve`, () =>
        HttpResponse.json({ error: "boom", message: "nope" }, { status: 500 }),
      ),
    );
    const { qc, wrapper } = setup();
    const order = renderHook(() => useOrder("ord_smudged"), { wrapper });
    await waitFor(() => expect(order.result.current.data).toBeDefined());
    const m = renderHook(() => useResolveField("ord_smudged"), { wrapper });
    act(() => m.result.current.mutate({ field: "drug.strength", body: { action: "accept" } }));
    await waitFor(() => expect(m.result.current.isError).toBe(true));
    expect(findField(qc.getQueryData<Order>(qk.order("ord_smudged"))!, "drug.strength")!.field.triage).toBe(
      "red",
    );
  });
});

describe("approve / reject", () => {
  it("surfaces the 409 and then approves after resolution", async () => {
    const { wrapper } = setup();
    const a = renderHook(() => useApprove("ord_smudged"), { wrapper });
    act(() => a.result.current.mutate());
    await waitFor(() => expect(a.result.current.error).toMatchObject({ status: 409 }));

    const r = renderHook(() => useResolveField("ord_smudged"), { wrapper });
    await act(() =>
      r.result.current.mutateAsync({ field: "drug.strength", body: { action: "edit", value: "500 mg" } }),
    );
    act(() => a.result.current.mutate());
    await waitFor(() => expect(a.result.current.data?.order.status).toBe("approved"));
  });

  it("rejects with a reason", async () => {
    const { wrapper } = setup();
    const r = renderHook(() => useReject("ord_controlled"), { wrapper });
    act(() => r.result.current.mutate("Invalid or unverifiable prescriber"));
    await waitFor(() => expect(r.result.current.data?.status).toBe("rejected"));
    expect(r.result.current.data?.audit.at(-1)?.detail).toBe("Invalid or unverifiable prescriber");
  });
});

describe("call lifecycle", () => {
  it("starts a call, plays it to completion, and accepting turns the field green", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { qc, wrapper } = setup();
      const order = renderHook(() => useOrder("ord_smudged"), { wrapper });
      await waitFor(() => expect(order.result.current.data).toBeDefined());

      const start = renderHook(() => useStartCall("ord_smudged"), { wrapper });
      act(() => start.result.current.mutate("drug.strength"));
      await waitFor(() => expect(start.result.current.data?.status).toBe("queued"));
      const id = start.result.current.data!.call_id;
      expect(qc.getQueryData<Order>(qk.order("ord_smudged"))?.active_call_id).toBe(id);

      // Second call on the same order is refused while the first is live.
      const again = renderHook(() => useStartCall("ord_smudged"), { wrapper });
      act(() => again.result.current.mutate("drug.name"));
      await waitFor(() => expect(again.result.current.error).toMatchObject({ status: 409 }));

      await act(() => vi.advanceTimersByTimeAsync(20_000));
      const call = renderHook(() => useCall(id), { wrapper });
      await waitFor(() => expect(call.result.current.data?.status).toBe("completed"));
      expect(call.result.current.data?.result?.confirmed_value).toBe("500 mg");
      expect(call.result.current.data?.transcript.length).toBeGreaterThan(4);

      const decide = renderHook(() => useCallDecision(), { wrapper });
      act(() => decide.result.current.mutate({ callId: id, decision: "accept" }));
      await waitFor(() => expect(decide.result.current.isSuccess).toBe(true));
      const f = findField(qc.getQueryData<Order>(qk.order("ord_smudged"))!, "drug.strength")!.field;
      expect(f).toMatchObject({ value: "500 mg", triage: "green", resolution: { by: "prescriber_call" } });
      expect(f.reads.some((r) => r.source === "prescriber_call")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useUploadFax", () => {
  // jsdom's XHR can't send multipart bodies through the MSW interceptor, so stub XHR here;
  // the real browser path (FormData → MSW → queue) is covered by e2e/upload.spec.ts.
  function stubXhr(status: number, body: unknown) {
    class FakeXHR {
      static sent: FormData | null = null;
      status = 0;
      responseText = "";
      responseType = "";
      upload: {
        onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
      } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open() {}
      send(form: FormData) {
        FakeXHR.sent = form;
        setTimeout(() => {
          this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
          this.status = status;
          this.responseText = JSON.stringify(body);
          this.onload?.();
        }, 5);
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    return FakeXHR;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("posts the file as multipart 'file', reports progress, and refreshes the queue", async () => {
    const X = stubXhr(200, { fax_id: "fax_up1", order_ids: ["ord_up1"] });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const up = renderHook(() => useUploadFax(), { wrapper });
    const progress: number[] = [];
    const file = new File([new Uint8Array(64)], "fax.pdf", { type: "application/pdf" });
    act(() => up.result.current.mutate({ file, onProgress: (p) => progress.push(p) }));
    await waitFor(() => expect(up.result.current.data?.order_ids).toEqual(["ord_up1"]));
    expect((X.sent!.get("file") as File).name).toBe("fax.pdf");
    expect(progress).toEqual([0.5, 1]);
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.orders() });
  });

  it("rejects with the server message", async () => {
    stubXhr(413, { error: "too_large", message: "File too large" });
    const { wrapper } = setup();
    const up = renderHook(() => useUploadFax(), { wrapper });
    act(() => up.result.current.mutate({ file: new File(["x"], "a.png", { type: "image/png" }) }));
    await waitFor(() =>
      expect(up.result.current.error).toMatchObject({
        status: 413,
        code: "too_large",
        message: "File too large",
      }),
    );
  });

  it("rejects a malformed success body", async () => {
    stubXhr(200, { fax: 1 });
    const { wrapper } = setup();
    const up = renderHook(() => useUploadFax(), { wrapper });
    act(() => up.result.current.mutate({ file: new File(["x"], "a.png", { type: "image/png" }) }));
    await waitFor(() => expect(up.result.current.error).toMatchObject({ code: "contract_violation" }));
  });
});

describe("useOrdersSocket", () => {
  class FakeWS {
    static last: FakeWS | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((m: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(public url: string) {
      FakeWS.last = this;
    }
    close() {}
  }

  it("goes live, applies events, and reconnects with backoff after a drop", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWS);
    setEmitter(() => {});
    try {
      const { qc, wrapper } = setup();
      qc.setQueryData(qk.orders(), []);
      const { unmount, result } = renderHook(() => (useOrdersSocket(), useSocketStatus()), { wrapper });
      const first = FakeWS.last!;
      act(() => first.onopen!());
      expect(result.current).toBe("live");

      const summary: OrderSummary = {
        order_id: "ord_x",
        fax_id: "fax_x",
        received_at: "2026-10-10T00:00:00Z",
        status: "processing",
        patient_initials: null,
        drug_display: null,
        prescriber_display: null,
        counts: { red: 0, yellow: 0, green: 0 },
        has_high_risk_flag: false,
      };
      act(() => first.onmessage!({ data: JSON.stringify({ type: "order.created", order: summary }) }));
      expect(qc.getQueryData<OrderSummary[]>(qk.orders())).toHaveLength(1);
      act(() => first.onmessage!({ data: "not json" }));
      vi.spyOn(console, "error").mockImplementationOnce(() => {});
      act(() => first.onmessage!({ data: JSON.stringify({ type: "nope" }) }));

      act(() => first.onclose!());
      expect(getSocketStatus()).toBe("reconnecting");
      act(() => vi.advanceTimersByTime(1000));
      expect(FakeWS.last).not.toBe(first);
      unmount();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
