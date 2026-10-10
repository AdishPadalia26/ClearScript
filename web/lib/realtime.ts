"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { env } from "@/lib/env";
import { wsEvent } from "@/lib/api/schemas";
import type { OrderStatus, OrderSummary, WsEvent } from "@/lib/api/types";
import { compareQueue } from "@/lib/order";
import { qk } from "@/lib/api/keys";

export type SocketStatus = "connecting" | "live" | "reconnecting";

// Tiny external store so any component (and query refetchInterval fns) can read socket health.
let status: SocketStatus = "connecting";
const listeners = new Set<() => void>();
function setStatus(next: SocketStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}
export const getSocketStatus = () => status;
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
export const useSocketStatus = () =>
  useSyncExternalStore(subscribe, getSocketStatus, () => "connecting" as const);

/** Poll interval while the socket is down; `false` while live. */
export const pollWhenOffline =
  (ms = 3000) =>
  () =>
    getSocketStatus() === "live" ? false : ms;

export const backoffDelay = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

/** Patch every cached queue list in place instead of refetching all of them. */
export function upsertSummary(qc: QueryClient, summary: OrderSummary) {
  const lists = qc.getQueriesData<OrderSummary[]>({ queryKey: qk.orders() });
  for (const [key, list] of lists) {
    if (!list) continue;
    const filter = key[1] as OrderStatus | undefined;
    const keep = !filter || filter === summary.status;
    const without = list.filter((o) => o.order_id !== summary.order_id);
    qc.setQueryData(key, keep ? [...without, summary].sort(compareQueue) : without);
  }
}

export function applyEvent(qc: QueryClient, ev: WsEvent) {
  if (ev.type === "call.updated") {
    qc.setQueryData(qk.call(ev.call.call_id), ev.call);
    // A finished call writes a prescriber_call read onto the field; refresh the order.
    if (ev.call.status === "completed" || ev.call.decision) {
      void qc.invalidateQueries({ queryKey: qk.order(ev.call.order_id) });
    }
    return;
  }
  upsertSummary(qc, ev.order);
  void qc.invalidateQueries({ queryKey: qk.order(ev.order.order_id) });
}

/** Mount once in the app shell. Reconnects with exponential backoff (1 s → 30 s). */
export function useOrdersSocket() {
  const qc = useQueryClient();
  useEffect(() => {
    let ws: WebSocket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      try {
        ws = new WebSocket(env.wsUrl);
      } catch {
        return schedule();
      }
      ws.onopen = () => {
        attempt = 0;
        setStatus("live");
        // Anything that changed while we were offline:
        void qc.invalidateQueries({ queryKey: qk.orders() });
      };
      ws.onmessage = (m) => {
        let raw: unknown;
        try {
          raw = JSON.parse(typeof m.data === "string" ? m.data : "");
        } catch {
          return;
        }
        const parsed = wsEvent.safeParse(raw);
        if (parsed.success) applyEvent(qc, parsed.data);
        else console.error("[ws] contract violation", parsed.error.issues);
      };
      ws.onclose = () => !closed && schedule();
    };

    const schedule = () => {
      setStatus("reconnecting");
      timer = setTimeout(connect, backoffDelay(attempt++));
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [qc]);
}
