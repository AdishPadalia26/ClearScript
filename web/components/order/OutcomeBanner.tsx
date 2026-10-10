"use client";

import { ArrowRight, CircleCheck, CircleX, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/api/types";

/**
 * The persistent result of a finished order. Time, actor and reason come from the order's own
 * audit trail, so the banner states exactly what the server recorded.
 */
export function OutcomeBanner({
  order,
  onViewFhir,
  onNext,
  hasNext,
}: {
  order: Order;
  onViewFhir: () => void;
  onNext: () => void;
  hasNext: boolean;
}) {
  if (order.status !== "approved" && order.status !== "rejected") return null;
  const approved = order.status === "approved";
  const entry = [...order.audit]
    .reverse()
    .find((a) => a.action === (approved ? "order.approved" : "order.rejected"));
  const when = entry
    ? new Date(entry.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div
      role="status"
      data-testid="outcome"
      data-outcome={order.status}
      className={
        approved
          ? "border-b border-green/30 bg-green-bg px-4 py-3 text-green"
          : "border-b border-red/30 bg-red-bg px-4 py-3 text-red"
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {approved ? <CircleCheck size={18} aria-hidden /> : <CircleX size={18} aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {approved ? "Approved and sent to the pharmacy system" : "Order rejected"}
          </p>
          <p className="text-[12.5px] text-ink">
            {[when && `${approved ? "Approved" : "Rejected"} at ${when}`, entry?.actor && `by ${entry.actor}`]
              .filter(Boolean)
              .join(" ")}
            {!approved && entry?.detail ? `. Reason: ${entry.detail}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {approved ? (
            <Button size="sm" onClick={onViewFhir}>
              <FileJson size={14} aria-hidden /> View FHIR order
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={onNext}>
            {hasNext ? "Next order" : "Back to queue"} <ArrowRight size={14} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
