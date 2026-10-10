"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSocketStatus, pollWhenOffline, upsertSummary } from "@/lib/realtime";
import { applyResolution, toSummary } from "@/lib/order";
import { api, redFieldsFrom } from "./client";
import { qk } from "./keys";
import type { Call, CallStatus, Order, OrderStatus, ResolveBody } from "./types";

const TERMINAL_CALL: ReadonlySet<CallStatus> = new Set(["completed", "no_answer", "failed"]);
export const isCallTerminal = (c: Pick<Call, "status">) => TERMINAL_CALL.has(c.status);

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Writes a fresh Order into its cache and the queue lists (no refetch needed). */
function putOrder(qc: QueryClient, order: Order) {
  qc.setQueryData(qk.order(order.order_id), order);
  upsertSummary(qc, toSummary(order));
}

// ── Queries ────────────────────────────────────────────────────────────────────

export const useOrders = (status?: OrderStatus) =>
  useQuery({
    queryKey: qk.orders(status),
    queryFn: () => api.listOrders(status),
    refetchInterval: pollWhenOffline(),
  });

export const useOrder = (id: string) =>
  useQuery({
    queryKey: qk.order(id),
    queryFn: () => api.getOrder(id),
    // Keep polling while the pipeline is still working, even with a live socket.
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 2000 : pollWhenOffline()()),
  });

export const useCall = (id: string | null | undefined) =>
  useQuery({
    queryKey: qk.call(id ?? "none"),
    queryFn: () => api.getCall(id!),
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data && isCallTerminal(q.state.data) ? false : getSocketStatus() === "live" ? 5000 : 1000,
  });

export const useMetrics = () =>
  useQuery({ queryKey: qk.metrics(), queryFn: api.getMetrics, staleTime: 60_000 });

// ── Mutations ──────────────────────────────────────────────────────────────────

export function useResolveField(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ field, body }: { field: string; body: ResolveBody }) =>
      api.resolveField(orderId, field, body),
    onMutate: async ({ field, body }) => {
      await qc.cancelQueries({ queryKey: qk.order(orderId) });
      const prev = qc.getQueryData<Order>(qk.order(orderId));
      if (prev) qc.setQueryData(qk.order(orderId), applyResolution(prev, field, body));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.order(orderId), ctx.prev);
      toast.error(`Couldn't save: ${errMsg(e)}`);
    },
    onSuccess: (order) => putOrder(qc, order),
  });
}

export function useStartCall(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (field: string) => api.startCall(orderId, field),
    onSuccess: (call) => {
      qc.setQueryData(qk.call(call.call_id), call);
      qc.setQueryData<Order>(qk.order(orderId), (o) => (o ? { ...o, active_call_id: call.call_id } : o));
    },
    onError: (e) => toast.error(`Couldn't start call: ${errMsg(e)}`),
  });
}

export function useCallDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ callId, decision }: { callId: string; decision: "accept" | "reject" }) =>
      api.callDecision(callId, decision),
    onSuccess: (order, { callId, decision }) => {
      putOrder(qc, order);
      qc.setQueryData<Call>(qk.call(callId), (c) => (c ? { ...c, decision } : c));
    },
    onError: (e) => toast.error(`Couldn't record decision: ${errMsg(e)}`),
  });
}

export function useApprove(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.approve(orderId),
    onSuccess: ({ order }) => putOrder(qc, order),
    onError: (e) => {
      // 409s are rendered by the approve bar (blocking field list), everything else toasts.
      if (!redFieldsFrom(e)) toast.error(`Approve failed: ${errMsg(e)}`);
    },
  });
}

export function useReject(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => api.reject(orderId, reason),
    onSuccess: (order) => putOrder(qc, order),
    onError: (e) => toast.error(`Reject failed: ${errMsg(e)}`),
  });
}

export function useUploadFax() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (f: number) => void }) =>
      api.uploadFax(file, onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.orders() }),
  });
}
