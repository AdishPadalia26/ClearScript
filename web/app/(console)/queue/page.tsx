"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CheckCheck, CircleCheck, Inbox, RotateCw, TriangleAlert, X } from "lucide-react";
import { QueueSummary } from "@/components/queue/QueueSummary";
import { QueueTable } from "@/components/queue/QueueTable";
import { useOpenUpload } from "@/components/shell/upload-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { useOrders } from "@/lib/api/hooks";
import type { OrderStatus, OrderSummary } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useHotkeys } from "@/lib/keyboard";
import { canBulkApprove, compareQueue } from "@/lib/order";

const TABS: { id: OrderStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "blocked", label: "Blocked" },
  { id: "needs_review", label: "Needs review" },
  { id: "ready", label: "Ready" },
  { id: "approved", label: "Approved" },
];

/** What a bulk approve actually did, kept on screen until dismissed (a toast alone is too easy to miss). */
interface BulkResult {
  approved: number;
  failed: { label: string; reason: string }[];
}

const orderLabel = (o: OrderSummary | undefined, id: string) => o?.drug_display ?? id;

export default function QueuePage() {
  const router = useRouter();
  const openUpload = useOpenUpload();
  // One cached list, filtered client-side: tab switches are instant and WS patches hit one cache.
  const { data, isPending, isError, error, refetch } = useOrders();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const sorted = useMemo(() => (data ? [...data].sort(compareQueue) : []), [data]);
  const rows = useMemo(
    () => (tab === "all" ? sorted : sorted.filter((o) => o.status === tab)),
    [sorted, tab],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sorted.length };
    for (const o of sorted) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [sorted]);
  // Drop selections that are no longer eligible (e.g. an order got a new flag over the socket).
  const eligible = useMemo(() => {
    const ok = new Set(sorted.filter(canBulkApprove).map((o) => o.order_id));
    return [...selected].filter((id) => ok.has(id));
  }, [sorted, selected]);
  const eligibleSet = useMemo(() => new Set(eligible), [eligible]);

  const openOrder = (id: string) => router.push(`/orders/${encodeURIComponent(id)}`);
  const nextId = sorted.find((o) => o.status === "blocked" || o.status === "needs_review")?.order_id;
  useHotkeys({ n: () => nextId && openOrder(nextId) });

  const bulk = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.approve(id)));
      return results.map((r, i) => ({ id: ids[i]!, r }));
    },
    onSuccess: (outcomes) => {
      const byId = new Map(sorted.map((o) => [o.order_id, o]));
      setBulkResult({
        approved: outcomes.filter((o) => o.r.status === "fulfilled").length,
        failed: outcomes.flatMap(({ id, r }) =>
          r.status === "rejected"
            ? [
                {
                  label: orderLabel(byId.get(id), id),
                  reason: r.reason instanceof Error ? r.reason.message : "Unknown error",
                },
              ]
            : [],
        ),
      });
      setSelected(new Set());
      setConfirm(false);
      void refetch();
    },
  });

  return (
    <div className="flex h-full flex-col">
      {data ? <QueueSummary orders={sorted} onReviewNext={openOrder} onUpload={openUpload} /> : null}

      {bulkResult ? (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 border-b px-4 py-2 text-[13px] sm:px-6",
            bulkResult.failed.length
              ? "border-yellow/30 bg-yellow-bg text-yellow"
              : "border-green/30 bg-green-bg text-green",
          )}
        >
          {bulkResult.failed.length ? (
            <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          ) : (
            <CircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Approved and sent {bulkResult.approved} order{bulkResult.approved === 1 ? "" : "s"}
              {bulkResult.failed.length ? `; ${bulkResult.failed.length} couldn't be approved:` : "."}
            </p>
            {bulkResult.failed.length ? (
              <ul className="mt-0.5 text-ink">
                {bulkResult.failed.map((f) => (
                  <li key={f.label}>
                    {f.label}: {f.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            onClick={() => setBulkResult(null)}
            className="rounded p-0.5 hover:bg-surface/60"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-b border-rule bg-surface pr-4 pl-2 sm:pl-4">
        {/* Tabs scroll horizontally on narrow screens instead of clipping. */}
        <div role="tablist" aria-label="Filter by status" className="flex min-w-0 flex-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative h-11 shrink-0 px-3 text-[13.5px] font-medium whitespace-nowrap",
                tab === t.id
                  ? "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-accent"
                  : "text-muted hover:text-ink",
              )}
            >
              {t.label}
              <span className="tabular ml-1.5 text-faint">{counts[t.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          disabled={!eligible.length}
          onClick={() => setConfirm(true)}
          aria-label={`Approve selected${eligible.length ? ` (${eligible.length})` : ""}`}
          title={
            eligible.length
              ? undefined
              : "Select ready orders without high-risk flags to approve them together"
          }
        >
          <CheckCheck size={15} aria-hidden />
          <span className="max-md:hidden">
            Approve selected{eligible.length ? ` (${eligible.length})` : ""}
          </span>
          {eligible.length ? <span className="tabular md:hidden">{eligible.length}</span> : null}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-surface">
        {isPending ? (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading orders">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-9" />
            ))}
          </div>
        ) : isError && !data ? (
          <div role="alert" className="flex flex-col items-center gap-3 p-16 text-center">
            <p className="font-medium">Couldn&apos;t load the queue.</p>
            <p className="text-muted">{error.message}</p>
            <Button onClick={() => refetch()}>
              <RotateCw size={14} aria-hidden /> Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-16 text-center text-muted">
            <Inbox size={28} aria-hidden />
            {tab === "all" ? (
              <>
                <p className="font-medium text-ink">No faxes yet</p>
                <p>New faxes appear here as they arrive. To try it now, upload a prescription fax.</p>
                <Button className="mt-2" onClick={openUpload}>
                  Upload a fax
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium text-ink">
                  No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} orders
                </p>
                <Button variant="ghost" className="mt-1 text-accent" onClick={() => setTab("all")}>
                  Show all {sorted.length} orders
                </Button>
              </>
            )}
          </div>
        ) : (
          <QueueTable orders={rows} selected={eligibleSet} onSelectedChange={setSelected} />
        )}
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title={`Approve ${eligible.length} order${eligible.length === 1 ? "" : "s"}?`}
          description="Each one is ready with every field verified and no high-risk flags. They'll be sent to the pharmacy system."
        >
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="primary"
              data-autofocus
              disabled={bulk.isPending}
              onClick={() => bulk.mutate(eligible)}
            >
              {bulk.isPending ? "Approving…" : `Approve ${eligible.length}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
