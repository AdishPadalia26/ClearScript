"use client";

import { ArrowRight, CircleCheck } from "lucide-react";
import { Button, Kbd } from "@/components/ui/button";
import type { OrderSummary } from "@/lib/api/types";

/**
 * The queue's opening statement: how much work needs a pharmacist, why only that, and the one
 * next action. `orders` must already be in queue order (blocked first).
 */
export function QueueSummary({
  orders,
  onReviewNext,
  onUpload,
}: {
  orders: OrderSummary[];
  onReviewNext: (id: string) => void;
  onUpload: () => void;
}) {
  const needs = orders.filter((o) => o.status === "blocked" || o.status === "needs_review");
  const blocked = needs.filter((o) => o.status === "blocked").length;
  const ready = orders.filter((o) => o.status === "ready").length;
  const processing = orders.filter((o) => o.status === "processing").length;
  const next = needs[0];

  const facts = [
    blocked ? `${blocked} blocked by a red field` : null,
    ready ? `${ready} ready to send` : null,
    processing ? `${processing} still being read` : null,
  ].filter(Boolean);

  return (
    <section aria-labelledby="queue-title" className="border-b border-rule bg-surface px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[22rem]">
          <h1 id="queue-title" className="text-[20px] leading-tight font-semibold">
            {next ? (
              <>
                <span className="tabular">{needs.length}</span> order{needs.length === 1 ? "" : "s"} need
                {needs.length === 1 ? "s" : ""} a pharmacist
              </>
            ) : (
              <span className="inline-flex items-center gap-2">
                <CircleCheck size={20} className="text-green" aria-hidden /> Nothing needs review
              </span>
            )}
          </h1>
          <p className="mt-1 max-w-[80ch] text-[13.5px] leading-snug text-muted">
            Every fax is read four ways and checked against RxNorm, the NPI Registry and safety rules. Only
            the fields ClearScript isn&apos;t sure about come to you.
          </p>
          {facts.length ? <p className="mt-1.5 text-[13.5px] font-medium">{facts.join(" · ")}</p> : null}
        </div>
        {next ? (
          <Button
            variant="primary"
            size="lg"
            onClick={() => onReviewNext(next.order_id)}
            data-testid="review-next"
          >
            Review next order <ArrowRight size={16} aria-hidden />
            <Kbd inverse className="ml-1 max-sm:hidden">
              N
            </Kbd>
          </Button>
        ) : (
          <Button size="lg" onClick={onUpload}>
            Upload a fax
          </Button>
        )}
      </div>
    </section>
  );
}
