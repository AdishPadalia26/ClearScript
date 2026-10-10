"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteError({
  error,
  reset,
  what,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  what: string;
}) {
  useEffect(() => {
    console.error(`[${what}]`, error.message);
  }, [error, what]);
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="font-medium">The {what} hit an error and stopped.</p>
      <p className="max-w-md text-muted">
        {error.message || "Unknown error."} Reloading this view usually fixes it; nothing you saved is lost.
      </p>
      <Button onClick={reset}>
        <RotateCw size={14} aria-hidden /> Reload view
      </Button>
    </div>
  );
}
