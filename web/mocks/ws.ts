import { ws } from "msw";
import { env } from "@/lib/env";

/** Mock `/ws/orders`. The db broadcasts events through this link; clients only listen. */
export const orders = ws.link(env.wsUrl);

export const wsHandlers = [orders.addEventListener("connection", () => {})];
