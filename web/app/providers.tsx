"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isApiError } from "@/lib/api/client";
import { isMock } from "@/lib/env";

const DemoContext = createContext(false);
/** `?demo=1` presentation mode (sticky for the browser tab; `?demo=0` turns it off). */
export const useDemo = () => useContext(DemoContext);

function readDemo(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") sessionStorage.setItem("cs-demo", "1");
    if (q === "0") sessionStorage.removeItem("cs-demo");
    return sessionStorage.getItem("cs-demo") === "1";
  } catch {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            // 4xx won't fix itself; retry only network/5xx.
            retry: (n, e) => !(isApiError(e) && e.status >= 400 && e.status < 500) && n < 2,
          },
        },
      }),
  );
  const [ready, setReady] = useState(!isMock);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    const d = readDemo();
    setDemo(d);
    document.documentElement.dataset.demo = d ? "1" : "0";
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The literal env check wraps the import() so webpack drops the whole mock chunk from live builds.
    if (process.env.NEXT_PUBLIC_API_MODE !== "live") {
      import("@/mocks/browser")
        .then(({ worker }) => worker.start({ onUnhandledRequest: "bypass", quiet: true }))
        .then(() => !cancelled && setReady(true))
        .catch((e) => console.error("[msw] failed to start", e));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={qc}>
      <DemoContext.Provider value={demo}>
        <TooltipProvider delayDuration={250}>
          {ready ? (
            children
          ) : (
            <div className="grid h-dvh place-items-center text-muted" role="status">
              Starting mock server…
            </div>
          )}
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{ className: "!font-sans !text-[13.5px]" }}
          />
        </TooltipProvider>
      </DemoContext.Provider>
    </QueryClientProvider>
  );
}
