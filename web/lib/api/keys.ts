import type { OrderStatus } from "./types";

export const qk = {
  orders: (status?: OrderStatus) => (status ? (["orders", status] as const) : (["orders"] as const)),
  order: (id: string) => ["order", id] as const,
  call: (id: string) => ["call", id] as const,
  metrics: () => ["metrics"] as const,
};
