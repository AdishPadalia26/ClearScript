import type { z } from "zod";
import { env } from "@/lib/env";
import * as s from "./schemas";
import type {
  ApproveResponse,
  Call,
  Metrics,
  Order,
  OrderStatus,
  OrderSummary,
  ResolveBody,
  UploadResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Field names are dotted (`drug.strength`) and must be encoded as one path segment. */
export const enc = (segment: string) => encodeURIComponent(segment);

export const pageUrl = (faxId: string, page: number) =>
  `${env.apiBase}/faxes/${enc(faxId)}/pages/${page}.png`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * One error shape for every transport. Understands the contract's `{error, message}` and FastAPI's
 * `{detail}` (a string, a validation array of `{msg}`, or an object wrapping `{error, message}`).
 */
export function apiErrorFrom(status: number, body: unknown, fallback: string): ApiError {
  const b = isRecord(body) ? body : {};
  const inner = isRecord(b.detail) ? b.detail : b;
  const code = typeof inner.error === "string" ? inner.error : `http_${status}`;
  let message = fallback;
  if (typeof inner.message === "string") message = inner.message;
  else if (typeof b.detail === "string") message = b.detail;
  else if (Array.isArray(b.detail)) {
    const msgs = b.detail.flatMap((d) => (isRecord(d) && typeof d.msg === "string" ? [d.msg] : []));
    if (msgs.length) message = msgs.join("; ");
  }
  return new ApiError(status, code, message, inner);
}

async function errorFrom(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return apiErrorFrom(res.status, body, `${res.status} ${res.statusText || "Request failed"}`);
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit & { json?: unknown },
): Promise<z.infer<S>> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`${env.apiBase}${path}`, {
      ...rest,
      headers: json !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    throw new ApiError(0, "network", "Can't reach the ClearScript server.", e);
  }
  if (!res.ok) throw await errorFrom(res);

  const data: unknown = await res.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Contract drift: never render unvalidated clinical data. Report it in BACKEND_REQUESTS.md.
    console.error(`[api] contract violation on ${path}`, parsed.error.issues);
    throw new ApiError(
      res.status,
      "contract_violation",
      `Unexpected response shape from ${path}`,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

const post = (json: unknown = {}) => ({ method: "POST", json }) as const;

export const api = {
  listOrders: (status?: OrderStatus): Promise<OrderSummary[]> =>
    request(`/orders${status ? `?status=${status}` : ""}`, s.orderSummaries),

  getOrder: (id: string): Promise<Order> => request(`/orders/${enc(id)}`, s.order),

  resolveField: (orderId: string, field: string, body: ResolveBody): Promise<Order> =>
    request(`/orders/${enc(orderId)}/fields/${enc(field)}/resolve`, s.order, post(body)),

  startCall: (orderId: string, field: string): Promise<Call> =>
    request(`/orders/${enc(orderId)}/fields/${enc(field)}/call`, s.call, post()),

  getCall: (callId: string): Promise<Call> => request(`/calls/${enc(callId)}`, s.call),

  callDecision: (callId: string, decision: "accept" | "reject"): Promise<Order> =>
    request(`/calls/${enc(callId)}/decision`, s.order, post({ decision })),

  approve: (orderId: string): Promise<ApproveResponse> =>
    request(`/orders/${enc(orderId)}/approve`, s.approveResponse, post()),

  reject: (orderId: string, reason: string): Promise<Order> =>
    request(`/orders/${enc(orderId)}/reject`, s.order, post({ reason })),

  getFhir: (orderId: string) => request(`/orders/${enc(orderId)}/fhir`, s.fhirBundle),

  getMetrics: (): Promise<Metrics> => request(`/metrics`, s.metrics),

  uploadFax: (file: File, onProgress?: (fraction: number) => void): Promise<UploadResponse> =>
    // XHR rather than fetch: fetch has no upload progress events.
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${env.apiBase}/faxes`);
      xhr.responseType = "text";
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onerror = () => reject(new ApiError(0, "network", "Upload failed: can't reach the server."));
      xhr.onload = () => {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* handled below */
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          return reject(apiErrorFrom(xhr.status, body, `Upload failed (${xhr.status}).`));
        }
        const parsed = s.uploadResponse.safeParse(body);
        if (!parsed.success)
          return reject(new ApiError(xhr.status, "contract_violation", "Bad upload response"));
        onProgress?.(1);
        resolve(parsed.data);
      };
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    }),
};

/** Extracts the blocking field list from a 409 approve response, if that's what this error is. */
export function redFieldsFrom(e: unknown): string[] | null {
  if (!isApiError(e) || e.status !== 409) return null;
  const parsed = s.redFieldsError.safeParse(e.details);
  return parsed.success ? parsed.data.fields : null;
}
