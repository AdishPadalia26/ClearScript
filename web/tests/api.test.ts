import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import * as s from "@/lib/api/schemas";
import { api, ApiError, apiErrorFrom, enc, redFieldsFrom } from "@/lib/api/client";
import { applyEvent, upsertSummary } from "@/lib/realtime";
import { qk } from "@/lib/api/keys";
import { toSummary } from "@/lib/order";
import { buildScenarios } from "@/mocks/fixtures/orders";
import { mockMetrics } from "@/mocks/fixtures/metrics";
import { server } from "@/mocks/server";
import { resetDb } from "@/mocks/db";
import type { OrderSummary } from "@/lib/api/types";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetDb());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("zod schemas", () => {
  it("accept every fixture", () => {
    for (const { order } of buildScenarios()) expect(s.order.safeParse(order).success).toBe(true);
    expect(s.metrics.safeParse(mockMetrics).success).toBe(true);
  });

  it("reject malformed fixtures", () => {
    const o = structuredClone(buildScenarios()[0]!.order);
    expect(s.order.safeParse({ ...o, status: "pending" }).success).toBe(false);
    expect(s.order.safeParse({ ...o, counts: { red: "1" } }).success).toBe(false);
    const badBox = structuredClone(o);
    badBox.fields.drug["drug.name"]!.reads[0]!.evidence!.bbox = [0, 0, 1.4, 1];
    expect(s.order.safeParse(badBox).success).toBe(false);
    const badTriage = structuredClone(o);
    (badTriage.fields.drug["drug.name"] as { triage: string }).triage = "orange";
    expect(s.order.safeParse(badTriage).success).toBe(false);
    expect(s.wsEvent.safeParse({ type: "order.deleted", order: {} }).success).toBe(false);
  });
});

describe("client against the mock server", () => {
  it("url-encodes dotted field names as one segment", () => {
    expect(enc("drug.strength")).toBe("drug.strength");
    expect(enc("a/b")).toBe("a%2Fb");
  });

  it("lists, gets and resolves", async () => {
    const list = await api.listOrders();
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect((await api.listOrders("ready")).every((o) => o.status === "ready")).toBe(true);
    const o = await api.resolveField("ord_smudged", "drug.strength", { action: "edit", value: "500 mg" });
    expect(o.counts.red).toBe(0);
  });

  it("returns 409 red_fields on blocked approve, then succeeds after resolving", async () => {
    const err = await api.approve("ord_smudged").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(redFieldsFrom(err)).toEqual(["drug.strength"]);
    await api.resolveField("ord_smudged", "drug.strength", { action: "edit", value: "500 mg" });
    const ok = await api.approve("ord_smudged");
    expect(ok.order.status).toBe("approved");
    expect(ok.fhir.resourceType).toBe("Bundle");
  });

  it("normalizes 404s and contract violations into ApiError", async () => {
    await expect(api.getOrder("nope")).rejects.toMatchObject({ status: 404, code: "not_found" });
    const { http, HttpResponse } = await import("msw");
    server.use(http.get("http://localhost:8000/metrics", () => HttpResponse.json({ split: "train" })));
    await expect(api.getMetrics()).rejects.toMatchObject({ code: "contract_violation" });
  });
});

describe("realtime cache patching", () => {
  it("upserts summaries into every cached list respecting its filter", () => {
    const qc = new QueryClient();
    const [clean, smudged] = buildScenarios().map((x) => toSummary(x.order));
    qc.setQueryData(qk.orders(), [clean!]);
    qc.setQueryData(qk.orders("ready"), [clean!]);
    qc.setQueryData(qk.orders("blocked"), []);
    upsertSummary(qc, smudged!);
    expect(qc.getQueryData<OrderSummary[]>(qk.orders())!.map((o) => o.order_id)).toEqual([
      "ord_smudged",
      "ord_clean",
    ]);
    expect(qc.getQueryData<OrderSummary[]>(qk.orders("blocked"))).toHaveLength(1);
    expect(qc.getQueryData<OrderSummary[]>(qk.orders("ready"))).toHaveLength(1);
    // Status change moves it out of a filtered list.
    upsertSummary(qc, { ...clean!, status: "approved" });
    expect(qc.getQueryData<OrderSummary[]>(qk.orders("ready"))).toHaveLength(0);
  });

  it("stores call updates directly", () => {
    const qc = new QueryClient();
    const call = { call_id: "c1", order_id: "o", field_name: "f", status: "dialing" } as never;
    applyEvent(qc, { type: "call.updated", call });
    expect(qc.getQueryData(qk.call("c1"))).toBe(call);
  });
});

describe("apiErrorFrom", () => {
  it("reads the contract shape", () => {
    expect(apiErrorFrom(409, { error: "call_active", message: "Busy" }, "x")).toMatchObject({
      code: "call_active",
      message: "Busy",
    });
  });
  it("reads FastAPI string, validation-array and wrapped details", () => {
    expect(apiErrorFrom(404, { detail: "Order not found" }, "x")).toMatchObject({
      code: "http_404",
      message: "Order not found",
    });
    expect(
      apiErrorFrom(422, { detail: [{ type: "missing", loc: ["body", "file"], msg: "Field required" }] }, "x"),
    ).toMatchObject({ code: "http_422", message: "Field required" });
    const wrapped = apiErrorFrom(409, { detail: { error: "red_fields", fields: ["drug.strength"] } }, "x");
    expect(redFieldsFrom(wrapped)).toEqual(["drug.strength"]);
  });
  it("falls back for empty or non-JSON bodies", () => {
    expect(apiErrorFrom(502, null, "Upload failed (502).")).toMatchObject({
      code: "http_502",
      message: "Upload failed (502).",
    });
  });
});
