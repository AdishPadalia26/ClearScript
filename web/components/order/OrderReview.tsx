"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Loader2, Phone, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { FaxViewer } from "@/components/fax/FaxViewer";
import type { OverlayBox } from "@/components/fax/BoxOverlay";
import { FieldDrawer, type DrawerMode } from "@/components/fields/FieldDrawer";
import { FieldPanel } from "@/components/fields/FieldPanel";
import { Button, Kbd } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { ApproveBar } from "./ApproveBar";
import { FhirModal } from "./FhirModal";
import { OutcomeBanner } from "./OutcomeBanner";
import { SafetyBanner } from "./SafetyBanner";
import { api, pageUrl, redFieldsFrom } from "@/lib/api/client";
import {
  isCallTerminal,
  useApprove,
  useCall,
  useCallDecision,
  useOrder,
  useOrders,
  useReject,
  useResolveField,
  useStartCall,
} from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { relativeTime, STATUS_LABEL } from "@/lib/format";
import { useHotkeys } from "@/lib/keyboard";
import { compareQueue, findField, isFlagged, orderedFields, primaryEvidenceRead } from "@/lib/order";
import { useStableCallback } from "@/lib/use-stable-callback";

function useSplit(key: string, initial = 55) {
  const [pct, setPct] = useState(initial);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(key));
      if (v >= 25 && v <= 75) setPct(v);
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const save = (v: number) => {
    setPct(v);
    try {
      localStorage.setItem(key, String(Math.round(v)));
    } catch {
      /* ignore */
    }
  };
  return [pct, save] as const;
}

function OrderSkeleton() {
  return (
    <div
      className="grid h-full grid-cols-1 lg:grid-cols-[55fr_45fr]"
      aria-busy="true"
      aria-label="Loading order"
    >
      <div className="hidden bg-lightbox lg:block" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-6 w-1/2" />
        <div className="skeleton h-8" />
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="skeleton h-11" />
        ))}
      </div>
    </div>
  );
}

export function OrderReview({ id }: { id: string }) {
  const router = useRouter();
  const { data: order, isPending, error, refetch } = useOrder(id);
  const { data: queue } = useOrders();

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ field: string; mode: DrawerMode } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fhir, setFhir] = useState<Record<string, unknown> | null>(null);
  const [serverBlocked, setServerBlocked] = useState<string[] | null>(null);
  // Remember the latest call per field so its result stays visible after the order clears active_call_id.
  const [callByField, setCallByField] = useState<Record<string, string>>({});
  const [split, setSplit] = useSplit("cs-split");
  const [faxCollapsed, setFaxCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  const container = useRef<HTMLDivElement>(null);

  const resolve = useResolveField(id);
  const startCall = useStartCall(id);
  const decide = useCallDecision();
  const approve = useApprove(id);
  const reject = useReject(id);

  const fields = useMemo(() => (order ? orderedFields(order) : []), [order]);
  const flagged = useMemo(
    () => fields.filter(({ field }) => isFlagged(field)).map(({ field }) => field.name),
    [fields],
  );
  const boxes = useMemo<OverlayBox[]>(
    () =>
      fields.flatMap(({ field }) => {
        const ev = primaryEvidenceRead(field)?.evidence;
        return ev && ev.page === order?.page
          ? [{ name: field.name, label: field.label, bbox: ev.bbox, triage: field.triage }]
          : [];
      }),
    [fields, order?.page],
  );

  // Restore an in-flight call after reload.
  const activeCallId = order?.active_call_id ?? null;
  const { data: activeCall } = useCall(activeCallId);
  useEffect(() => {
    if (activeCall)
      setCallByField((m) =>
        m[activeCall.field_name] === activeCall.call_id
          ? m
          : { ...m, [activeCall.field_name]: activeCall.call_id },
      );
  }, [activeCall]);

  const drawerField = drawer && order ? (findField(order, drawer.field)?.field ?? null) : null;
  const drawerCallId = drawer ? callByField[drawer.field] : undefined;
  const { data: drawerCall } = useCall(drawerCallId);
  const callBusy = !!activeCall && !isCallTerminal(activeCall) && activeCall.field_name !== drawer?.field;
  const callBlocked = callBusy ? "Another call is active on this order. Wait for it to finish." : null;

  const activeBox = hovered ?? drawer?.field ?? selected;
  const focusBox = useMemo(
    () => boxes.find((b) => b.name === (drawer?.field ?? selected))?.bbox ?? null,
    [boxes, drawer?.field, selected],
  );

  const pageSrc = order ? pageUrl(order.fax_id, order.page) : "";

  const nextOrderId = useMemo(() => {
    const open = (queue ?? []).filter(
      (o) => o.order_id !== id && ["blocked", "needs_review", "ready"].includes(o.status),
    );
    return open.sort(compareQueue)[0]?.order_id ?? null;
  }, [queue, id]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const openField = useStableCallback((name: string, mode: DrawerMode = "view") => {
    setSelected(name);
    setDrawer({ field: name, mode });
  });
  const onHover = useCallback((n: string | null) => setHovered(n), []);
  const onPickBox = useStableCallback((name: string) => openField(name));

  const step = (dir: 1 | -1) => {
    if (!flagged.length) {
      toast("No flagged fields left.", { duration: 1500 });
      return;
    }
    const names = fields.map(({ field }) => field.name);
    const cur = drawer?.field ?? selected;
    const from = cur ? names.indexOf(cur) : dir === 1 ? -1 : names.length;
    let target = flagged[dir === 1 ? 0 : flagged.length - 1]!;
    for (let i = 1; i <= names.length; i++) {
      const n = names[(from + dir * i + names.length * 2) % names.length]!;
      if (flagged.includes(n)) {
        target = n;
        break;
      }
    }
    setSelected(target);
    if (drawer) setDrawer({ field: target, mode: "view" });
  };

  const accept = (name: string) => {
    const f = order && findField(order, name)?.field;
    if (!f || !isFlagged(f) || f.value == null) return;
    resolve.mutate({ field: name, body: { action: "accept" } });
    setServerBlocked(null);
  };
  const edit = (name: string, value: string) => {
    resolve.mutate({ field: name, body: { action: "edit", value } });
    setDrawer((d) => (d ? { ...d, mode: "view" } : d));
    setServerBlocked(null);
  };
  const doStartCall = () => {
    if (!drawer) return;
    const field = drawer.field;
    startCall.mutate(field, { onSuccess: (c) => setCallByField((m) => ({ ...m, [field]: c.call_id })) });
  };
  const doDecide = (decision: "accept" | "reject") => {
    if (!drawerCallId) return;
    decide.mutate(
      { callId: drawerCallId, decision },
      { onSuccess: () => decision === "accept" && toast.success("Office answer accepted. Field updated.") },
    );
  };
  const goNext = () => router.push(nextOrderId ? `/orders/${encodeURIComponent(nextOrderId)}` : "/queue");
  const doApprove = () =>
    approve.mutate(undefined, {
      onSuccess: ({ fhir }) => {
        setConfirmOpen(false);
        setDrawer(null);
        setFhir(fhir);
        toast.success("Order approved and sent.");
      },
      onError: (e) => {
        setConfirmOpen(false);
        const red = redFieldsFrom(e);
        if (red?.length) {
          setServerBlocked(red);
          setSelected(red[0]!);
          document.getElementById(`field-${red[0]}`)?.scrollIntoView({ block: "center" });
        }
      },
    });
  const jumpTo = (name: string) => {
    setSelected(name);
    document.getElementById(`field-${name}`)?.scrollIntoView({ block: "center" });
  };

  const done = order?.status === "approved" || order?.status === "rejected";

  useHotkeys(
    {
      j: () => step(1),
      k: () => step(-1),
      Enter: () => {
        if (drawer?.mode === "view") accept(drawer.field);
        else if (!drawer && selected) openField(selected);
      },
      e: () => {
        const n = drawer?.field ?? selected;
        if (n) openField(n, "edit");
      },
      c: () => {
        const n = drawer?.field ?? selected;
        const f = n && order ? findField(order, n)?.field : null;
        if (n && f && isFlagged(f) && !callBlocked) openField(n, "call");
      },
      b: () => setShowAll((v) => !v),
      "mod+Enter": () => {
        if (order && order.counts.red === 0 && !done && order.status !== "processing") setConfirmOpen(true);
        else if (order?.counts.red) toast.error("Resolve the blocking fields first.");
      },
    },
    !!order,
  );

  // Viewing an approved order: let the pharmacist pull the FHIR bundle again.
  const showFhir = async () => {
    try {
      setFhir(await api.getFhir(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load FHIR");
    }
  };

  // Resizable split (pointer drag on the gutter, arrow keys when focused).
  const onGutterDown = (e: React.PointerEvent) => {
    const el = container.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const move = (ev: PointerEvent) =>
      setSplit(Math.min(75, Math.max(25, ((ev.clientX - r.left) / r.width) * 100)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (isPending) return <OrderSkeleton />;
  if (!order) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">
          {error && "status" in error && error.status === 404
            ? "This order doesn't exist."
            : "Couldn't load this order."}
        </p>
        <p className="text-muted">{error?.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => refetch()}>
            <RotateCw size={14} aria-hidden /> Try again
          </Button>
          <Link
            href="/queue"
            className="inline-flex h-9 items-center rounded-md px-3 text-[13.5px] font-medium text-accent hover:bg-surface-2"
          >
            Back to queue
          </Link>
        </div>
      </div>
    );
  }

  const processing = order.status === "processing";
  const v = (n: string) => findField(order, n)?.field.value;

  return (
    <div
      ref={container}
      className="flex h-full flex-col lg:flex-row"
      style={{ ["--split" as string]: `${split}%` }}
    >
      {/* Left: the fax */}
      <section
        aria-label="Fax"
        className={cn("relative min-h-0 lg:h-full lg:w-[var(--split)]", faxCollapsed ? "h-10" : "h-[45vh]")}
      >
        <button
          className="flex h-10 w-full items-center gap-2 bg-lightbox px-3 text-[13px] text-lightbox-ink lg:hidden"
          onClick={() => setFaxCollapsed((c) => !c)}
          aria-expanded={!faxCollapsed}
        >
          {faxCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}{" "}
          {faxCollapsed ? "Show fax" : "Hide fax"}
        </button>
        <div className={cn("h-[calc(100%-2.5rem)] lg:h-full", faxCollapsed && "hidden lg:block")}>
          <FaxViewer
            src={pageSrc}
            boxes={boxes}
            active={activeBox}
            showAll={showAll}
            onToggleShowAll={() => setShowAll((s) => !s)}
            onPick={onPickBox}
            onHover={onHover}
            focusBox={focusBox}
          />
        </div>
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(split)}
        aria-valuemin={25}
        aria-valuemax={75}
        aria-label="Resize fax and fields"
        tabIndex={0}
        onPointerDown={onGutterDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSplit(Math.max(25, split - 2));
          if (e.key === "ArrowRight") setSplit(Math.min(75, split + 2));
        }}
        className="hidden w-1.5 shrink-0 cursor-col-resize bg-rule transition-colors hover:bg-accent/50 lg:block"
      />

      {/* Right: fields */}
      <section aria-label="Order fields" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5">
          <Link
            href="/queue"
            className="-ml-1 rounded p-1 text-muted hover:bg-surface-2"
            aria-label="Back to queue"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold">
              {v("drug.name") ?? "New fax"} {v("drug.strength") ?? ""}
            </h1>
            <p className="text-[12.5px] text-muted">
              Received {relativeTime(order.received_at)} · {STATUS_LABEL[order.status]} ·{" "}
              <span className="font-mono">{order.order_id}</span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {activeCall && !isCallTerminal(activeCall) ? (
              <button
                onClick={() => openField(activeCall.field_name)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-accent px-2.5 text-[12.5px] font-medium text-accent-ink"
                data-testid="call-chip"
              >
                <Phone size={12} className="animate-pulse" aria-hidden /> Call in progress
              </button>
            ) : null}
            {order.trace_url ? (
              <a
                href={order.trace_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-accent hover:bg-accent-bg"
              >
                View trace <ExternalLink size={12} aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </header>

        <OutcomeBanner order={order} onViewFhir={showFhir} onNext={goNext} hasNext={!!nextOrderId} />
        <SafetyBanner notices={order.safety_notices} />

        {processing ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted"
            role="status"
          >
            <Loader2 className="animate-spin text-accent" size={22} aria-hidden />
            <p className="font-medium text-ink">Reading the fax</p>
            <p>
              Four readers and the registry checks usually finish in under 10 seconds. This page updates on
              its own.
            </p>
          </div>
        ) : (
          <>
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-rule px-4 py-2 text-[13px]"
              data-testid="summary"
            >
              <span className={cn("font-medium", order.counts.red ? "text-red" : "text-muted")}>
                {order.counts.red} blocking
              </span>
              <span className="text-faint" aria-hidden>
                ·
              </span>
              <span className={cn("font-medium", order.counts.yellow ? "text-yellow" : "text-muted")}>
                {order.counts.yellow} to check
              </span>
              <span className="text-faint" aria-hidden>
                ·
              </span>
              <span className="text-muted">{order.counts.green} verified</span>
              <div className="ml-auto flex gap-1">
                <Tip
                  content={
                    <span>
                      Previous flag <Kbd className="ml-1">K</Kbd>
                    </span>
                  }
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => step(-1)}
                    disabled={!flagged.length}
                    aria-label="Previous flag"
                  >
                    <ChevronUp size={14} /> <span className="hidden sm:inline">Prev</span>
                  </Button>
                </Tip>
                <Tip
                  content={
                    <span>
                      Next flag <Kbd className="ml-1">J</Kbd>
                    </span>
                  }
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => step(1)}
                    disabled={!flagged.length}
                    aria-label="Next flag"
                  >
                    <ChevronDown size={14} /> Next<span className="hidden sm:inline">&nbsp;flag</span>
                  </Button>
                </Tip>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FieldPanel
                order={order}
                selected={selected}
                hot={activeBox}
                onOpen={openField}
                onHover={onHover}
              />
            </div>
          </>
        )}

        <ApproveBar
          order={order}
          approving={approve.isPending}
          rejecting={reject.isPending}
          confirmOpen={confirmOpen}
          onConfirmOpenChange={setConfirmOpen}
          onApprove={doApprove}
          onReject={(reason) => reject.mutate(reason, { onSuccess: () => toast.success("Order rejected.") })}
          serverBlocked={serverBlocked}
          onJumpTo={jumpTo}
        />
      </section>

      <FieldDrawer
        open={!!drawer && !!drawerField}
        order={order}
        field={drawerField}
        pageSrc={pageSrc}
        mode={drawer?.mode ?? "view"}
        onModeChange={(mode) => setDrawer((d) => (d ? { ...d, mode } : d))}
        onClose={() => setDrawer(null)}
        onAccept={() => drawer && accept(drawer.field)}
        onEdit={(value) => drawer && edit(drawer.field, value)}
        resolving={resolve.isPending}
        call={drawerCall ?? null}
        callBlocked={callBlocked}
        starting={startCall.isPending}
        deciding={decide.isPending}
        onStartCall={doStartCall}
        onDecide={doDecide}
      />

      <FhirModal
        open={!!fhir}
        onOpenChange={(o) => !o && setFhir(null)}
        orderId={order.order_id}
        bundle={fhir}
        onNext={order.status === "approved" ? goNext : undefined}
      />
    </div>
  );
}
