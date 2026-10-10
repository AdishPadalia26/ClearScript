import { delay, http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import { db, setEmitter } from "./db";
import { mockMetrics } from "./fixtures/metrics";
import { orders as wsLink } from "./ws";

const base = env.apiBase;
const latency = () => delay(200 + Math.floor(Math.random() * 400));
const notFound = (what: string) =>
  HttpResponse.json({ error: "not_found", message: `${what} not found` }, { status: 404 });
const p = (v: string | readonly string[] | undefined) => decodeURIComponent(String(v ?? ""));

setEmitter((ev) => wsLink.broadcast(JSON.stringify(ev)));

export const handlers = [
  http.get(`${base}/orders`, async ({ request }) => {
    await latency();
    return HttpResponse.json(db.listOrders(new URL(request.url).searchParams.get("status") ?? undefined));
  }),

  http.get(`${base}/orders/:id`, async ({ params }) => {
    await latency();
    const o = db.getOrder(p(params.id));
    return o ? HttpResponse.json(o) : notFound("Order");
  }),

  http.get(`${base}/orders/:id/fhir`, async ({ params }) => {
    await latency();
    const b = db.fhir(p(params.id));
    return b
      ? HttpResponse.json(b)
      : HttpResponse.json({ error: "not_approved", message: "Order is not approved" }, { status: 409 });
  }),

  http.get(`${base}/faxes/:faxId/pages/:file`, ({ params }) => {
    const svg = db.faxPage(p(params.faxId));
    if (!svg) return new HttpResponse(null, { status: 404 });
    // Served as SVG under a .png path: <img> and <canvas> don't care, and it keeps fixtures tiny.
    return new HttpResponse(svg, {
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "max-age=3600",
        "access-control-allow-origin": "*",
      },
    });
  }),

  http.post(`${base}/orders/:id/fields/:field/resolve`, async ({ params, request }) => {
    await latency();
    const body = (await request.json()) as { action: "accept" | "edit"; value?: string };
    if (body.action === "edit" && !body.value?.trim())
      return HttpResponse.json({ error: "invalid", message: "Value is required" }, { status: 422 });
    const o = db.resolve(p(params.id), p(params.field), body);
    return o ? HttpResponse.json(o) : notFound("Field");
  }),

  http.post(`${base}/orders/:id/fields/:field/call`, async ({ params }) => {
    await latency();
    const c = db.startCall(p(params.id), p(params.field));
    if (c === "busy")
      return HttpResponse.json(
        { error: "call_active", message: "A call is already active on this order" },
        { status: 409 },
      );
    return c ? HttpResponse.json(c) : notFound("Field");
  }),

  http.get(`${base}/calls/:id`, async ({ params }) => {
    await delay(120);
    const c = db.getCall(p(params.id));
    return c ? HttpResponse.json(c) : notFound("Call");
  }),

  http.post(`${base}/calls/:id/decision`, async ({ params, request }) => {
    await latency();
    const { decision } = (await request.json()) as { decision: "accept" | "reject" };
    const o = db.decide(p(params.id), decision);
    return o ? HttpResponse.json(o) : notFound("Call");
  }),

  http.post(`${base}/orders/:id/approve`, async ({ params }) => {
    await latency();
    const r = db.approve(p(params.id));
    if (!r) return notFound("Order");
    if ("red" in r) return HttpResponse.json({ error: "red_fields", fields: r.red }, { status: 409 });
    return HttpResponse.json(r);
  }),

  http.post(`${base}/orders/:id/reject`, async ({ params, request }) => {
    await latency();
    const { reason } = (await request.json()) as { reason: string };
    const o = db.reject(p(params.id), reason);
    return o ? HttpResponse.json(o) : notFound("Order");
  }),

  http.post(`${base}/faxes`, async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return HttpResponse.json({ error: "invalid", message: "file is required" }, { status: 422 });
    await delay(700);
    return HttpResponse.json(db.upload(file.name));
  }),

  http.get(`${base}/metrics`, async () => {
    await latency();
    return HttpResponse.json(mockMetrics);
  }),
];
