"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} what="metrics page" />;
}
