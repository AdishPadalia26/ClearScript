"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCheck, Inbox, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { QueueTable } from "@/components/queue/QueueTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { useOrders } from "@/lib/api/hooks";
import type { OrderStatus } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { compareQueue } from "@/lib/order";

const TABS: { id: OrderStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "blocked", label: "Blocked" },
  { id: "needs_review", label: "Needs review" },
  { id: "ready", label: "Ready" },
  { id: "approved", label: "Approved" },
];

export default function QueuePage() {
  // One cached list, filtered client-side: tab switches are instant and WS patches hit one cache.
  const { data, isPending, isError, error, refetch } = useOrders();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

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
    const ok = new Set(
      sorted.filter((o) => o.status === "ready" && !o.has_high_risk_flag).map((o) => o.order_id),
    );
    return [...selected].filter((id) => ok.has(id));
  }, [sorted, selected]);
  const eligibleSet = useMemo(() => new Set(eligible), [eligible]);

  const bulk = useMutation({
    mutationFn: async (ids: string[]) => Promise.allSettled(ids.map((id) => api.approve(id))),
    onSuccess: (results) => {
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      if (ok) toast.success(`Approved ${ok} order${ok === 1 ? "" : "s"}.`);
      if (failed)
        toast.error(`${failed} order${failed === 1 ? "" : "s"} couldn't be approved. Open them to see why.`);
      setSelected(new Set());
      setConfirm(false);
      void refetch();
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-rule bg-surface px-4">
        <div role="tablist" aria-label="Filter by status" className="flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative h-11 px-3 text-[13.5px] font-medium",
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
        <div className="ml-auto">
          <Button variant="secondary" disabled={!eligible.length} onClick={() => setConfirm(true)}>
            <CheckCheck size={15} aria-hidden /> Approve selected
            {eligible.length ? ` (${eligible.length})` : ""}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-surface">
        {isPending ? (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading orders">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-9" />
            ))}
          </div>
        ) : isError ? (
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
            <p className="font-medium text-ink">{tab === "all" ? "No faxes yet" : "Nothing here"}</p>
            <p>
              {tab === "all"
                ? "Upload a fax, or wait for one to arrive. New orders appear here automatically."
                : "Orders with this status will show up here."}
            </p>
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
              autoFocus
              disabled={bulk.isPending}
              onClick={() => bulk.mutate(eligible)}
            >
              Approve {eligible.length}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
