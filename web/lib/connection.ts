"use client";

import { useSyncExternalStore } from "react";
import { isApiError } from "@/lib/api/client";
import { useSocketStatus } from "@/lib/realtime";

// Server reachability, learned from real request outcomes, never from `navigator.onLine`, which
// only reflects the machine's internet link (a localhost backend works without one, and a dead
// backend looks "online").

export type ApiReachability = "unknown" | "ok" | "unreachable";

let reach: ApiReachability = "unknown";
const listeners = new Set<() => void>();
const set = (next: ApiReachability) => {
  if (next === reach) return;
  reach = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

/** Feed every query/mutation outcome here (wired in the QueryClient caches). */
export const reportApiSuccess = () => set("ok");
export const reportApiError = (e: unknown) => {
  // Status 0 = the request never got a response. Any HTTP status means the server is up.
  if (isApiError(e) && e.status === 0) set("unreachable");
  else if (isApiError(e)) set("ok");
};

export const getApiReachability = () => reach;
export const useApiReachability = () =>
  useSyncExternalStore(subscribe, getApiReachability, () => "unknown" as const);

export type ConnectionView =
  | { kind: "live"; label: "Live"; detail: string }
  | { kind: "polling"; label: "Auto-refresh"; detail: string }
  | { kind: "connecting"; label: "Connecting"; detail: string }
  | { kind: "down"; label: "Server unreachable"; detail: string };

/** One user-facing connection state, combining reachability with the live-update socket. */
export function describeConnection(
  api: ApiReachability,
  socket: "connecting" | "live" | "reconnecting",
): ConnectionView {
  if (api === "unreachable")
    return {
      kind: "down",
      label: "Server unreachable",
      detail: "Can't reach the ClearScript server. Retrying every 3 seconds.",
    };
  if (socket === "live")
    return { kind: "live", label: "Live", detail: "Changes from other pharmacists appear instantly." };
  if (api === "unknown")
    return { kind: "connecting", label: "Connecting", detail: "Connecting to the ClearScript server…" };
  return {
    kind: "polling",
    label: "Auto-refresh",
    detail: "Live updates aren't available, so the queue refreshes every 3 seconds.",
  };
}

export const useConnection = () => describeConnection(useApiReachability(), useSocketStatus());
