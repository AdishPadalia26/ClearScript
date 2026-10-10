"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { FlagChips } from "@/components/fields/TriageBadge";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import type { OrderStatus, OrderSummary } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { relativeTime, STATUS_LABEL } from "@/lib/format";
import { useHotkeys } from "@/lib/keyboard";
import { canBulkApprove } from "@/lib/order";
import { useStableCallback } from "@/lib/use-stable-callback";

const STATUS_STYLE: Record<OrderStatus, string> = {
  blocked: "text-red",
  needs_review: "text-yellow",
  ready: "text-green",
  processing: "text-muted",
  approved: "text-muted",
  rejected: "text-muted",
};

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const Row = memo(function Row({
  o,
  now,
  active,
  checked,
  onToggle,
  onOpen,
  onHover,
}: {
  o: OrderSummary;
  now: number;
  active: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onHover: (id: string) => void;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const bulk = canBulkApprove(o);
  return (
    <tr
      ref={ref}
      data-testid="queue-row"
      data-order-id={o.order_id}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={() => onOpen(o.order_id)}
      onMouseEnter={() => onHover(o.order_id)}
      className={cn(
        "h-11 cursor-pointer border-b border-rule text-[13.5px] transition-colors duration-100 focus-visible:outline-offset-[-2px]",
        active ? "bg-accent-bg" : "hover:bg-surface-2",
      )}
    >
      <td className="w-10 pl-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)] disabled:opacity-30"
          disabled={!bulk}
          checked={checked}
          onChange={() => onToggle(o.order_id)}
          aria-label={
            bulk
              ? `Select ${o.drug_display ?? o.order_id} for bulk approve`
              : "Only ready orders without high-risk fields can be bulk approved"
          }
        />
      </td>
      <td className="tabular px-3 whitespace-nowrap text-muted">
        <time dateTime={o.received_at} title={new Date(o.received_at).toLocaleString()}>
          {relativeTime(o.received_at, now)}
        </time>
      </td>
      <td className="px-3 font-mono">{o.patient_initials ?? "—"}</td>
      <td className="px-3 font-medium">
        {o.status === "processing" ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Loader2 size={13} className="animate-spin" aria-hidden /> Reading fax…
          </span>
        ) : (
          (o.drug_display ?? "—")
        )}
      </td>
      <td className="px-3 text-muted">{o.prescriber_display ?? "—"}</td>
      <td className="px-3">
        {o.status === "processing" ? null : <FlagChips red={o.counts.red} yellow={o.counts.yellow} />}
      </td>
      <td className={cn("px-3 pr-4 font-medium whitespace-nowrap", STATUS_STYLE[o.status])}>
        {STATUS_LABEL[o.status]}
      </td>
    </tr>
  );
});

export function QueueTable({
  orders,
  selected,
  onSelectedChange,
}: {
  orders: OrderSummary[];
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const now = useNow();
  const [cursor, setCursor] = useState(0);
  const ids = useMemo(() => orders.map((o) => o.order_id), [orders]);
  const bulkable = useMemo(() => orders.filter(canBulkApprove).map((o) => o.order_id), [orders]);

  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, ids.length - 1))), [ids.length]);

  // Stable callbacks keep memoized rows from re-rendering on every cursor move.
  const open = useStableCallback((id: string) => router.push(`/orders/${encodeURIComponent(id)}`));
  const hover = useStableCallback(
    (id: string) =>
      void qc.prefetchQuery({ queryKey: qk.order(id), queryFn: () => api.getOrder(id), staleTime: 10_000 }),
  );
  const toggle = useStableCallback((id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  });

  // Keyboard moves take focus with them, so Enter opens the row even after clicking a tab or button.
  const move = (d: 1 | -1) => {
    const next = Math.min(ids.length - 1, Math.max(0, cursor + d));
    setCursor(next);
    const id = ids[next];
    if (id) document.querySelector<HTMLElement>(`[data-order-id="${CSS.escape(id)}"]`)?.focus();
  };

  useHotkeys({
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    j: () => move(1),
    k: () => move(-1),
    Enter: () => ids[cursor] && open(ids[cursor]),
  });

  const allChecked = bulkable.length > 0 && bulkable.every((id) => selected.has(id));

  return (
    <table className="w-full border-collapse" aria-label="Order queue">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="h-9 border-b border-rule text-left text-[12.5px] text-muted">
          <th className="w-10 pl-4 font-normal">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)] disabled:opacity-30"
              disabled={!bulkable.length}
              checked={allChecked}
              onChange={() => onSelectedChange(allChecked ? new Set() : new Set(bulkable))}
              aria-label="Select all ready orders"
            />
          </th>
          <th className="px-3 font-medium">Received</th>
          <th className="px-3 font-medium">Patient</th>
          <th className="px-3 font-medium">Drug</th>
          <th className="px-3 font-medium">Prescriber</th>
          <th className="px-3 font-medium">Flags</th>
          <th className="px-3 pr-4 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o, i) => (
          <Row
            key={o.order_id}
            o={o}
            now={now}
            active={i === cursor}
            checked={selected.has(o.order_id)}
            onToggle={toggle}
            onOpen={open}
            onHover={hover}
          />
        ))}
      </tbody>
    </table>
  );
}
