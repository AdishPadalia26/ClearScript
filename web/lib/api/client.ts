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

async function errorFrom(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const code = typeof b.error === "string" ? b.error : `http_${res.status}`;
  const message =
    typeof b.message === "string"
      ? b.message
      : typeof b.detail === "string"
        ? b.detail
        : `${res.status} ${res.statusText || "Request failed"}`;
  return new ApiError(res.status, code, message, body);
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
          const b = (body ?? {}) as Record<string, unknown>;
          const msg = typeof b.message === "string" ? b.message : `Upload failed (${xhr.status})`;
          return reject(
            new ApiError(xhr.status, typeof b.error === "string" ? b.error : "upload", msg, body),
          );
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
