// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced literally.
export const env = {
  apiBase: (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000").replace(/\/+$/, ""),
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/orders",
  apiMode: (process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock") as "live" | "mock",
  pharmacyName: process.env.NEXT_PUBLIC_PHARMACY_NAME ?? "Main Street Pharmacy",
} as const;

export const isMock = env.apiMode === "mock";
