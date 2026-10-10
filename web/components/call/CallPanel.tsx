"use client";

import { useEffect, useState } from "react";
import { Check, Phone, PhoneOff, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Call, CallStatus, Field, Order } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { CALL_STATUS_LABEL, elapsed, maskPhone, NUMBER_SOURCE_LABEL } from "@/lib/format";
import { callQuestion, findField } from "@/lib/order";
import { CallResult } from "./CallResult";
import { Transcript } from "./Transcript";

const STEPS: CallStatus[] = ["queued", "dialing", "in_progress", "completed"];

function Stepper({ status }: { status: CallStatus }) {
  const failed = status === "no_answer" || status === "failed";
  const at = failed ? 1 : STEPS.indexOf(status);
  return (
    <ol className="flex items-center gap-1" aria-label="Call progress">
      {STEPS.map((s, i) => {
        const done = i < at || status === "completed";
        const current = i === at && !failed && status !== "completed";
        return (
          <li key={s} className="flex flex-1 items-center gap-1" aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border text-[10px]",
                done
                  ? "border-accent bg-accent text-accent-ink"
                  : current
                    ? "animate-ring border-accent text-accent"
                    : "border-rule-strong text-faint",
              )}
            >
              {done ? <Check size={11} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[12px] whitespace-nowrap",
                current || done ? "font-medium text-ink" : "text-faint",
              )}
            >
              {CALL_STATUS_LABEL[s]}
            </span>
            {i < STEPS.length - 1 ? (
              <span className={cn("mx-1 h-px flex-1", done ? "bg-accent" : "bg-rule")} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function useTicker(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export function CallPanel({
  order,
  field,
  call,
  starting,
  deciding,
  blockedReason,
  onStart,
  onDecide,
  onResolveManually,
  onCancel,
}: {
  order: Order;
  field: Field;
  call: Call | null;
  starting: boolean;
  deciding: boolean;
  /** Set when a call can't be started (e.g. another call is active on the order). */
  blockedReason?: string | null;
  onStart: () => void;
  onDecide: (d: "accept" | "reject") => void;
  onResolveManually: () => void;
  onCancel: () => void;
}) {
  const live =
    !!call && (call.status === "dialing" || call.status === "in_progress" || call.status === "queued");
  const now = useTicker(live);
  const prescriber = findField(order, "prescriber.name")?.field.value ?? "the prescriber";

  // ── Pre-call confirmation: nothing dials until the pharmacist presses Start call.
  if (!call) {
    const phone = findField(order, "prescriber.phone")?.field.value;
    return (
      <div className="rounded-lg border border-rule bg-surface" data-testid="precall">
        <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5 font-semibold">
          <Phone size={15} aria-hidden /> Call the prescriber&apos;s office
        </div>
        <dl className="space-y-3 px-4 py-3 text-[13.5px]">
          <div>
            <dt className="text-[12px] text-muted">Who we&apos;ll call</dt>
            <dd>
              {prescriber}{" "}
              <span className="ml-1 font-mono">{phone ? maskPhone(phone) : "number from NPI Registry"}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Where the number came from</dt>
            <dd className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-muted" aria-hidden />
              Fax header, checked against the NPI Registry before dialing
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">What the agent will ask</dt>
            <dd className="mt-1 rounded-md bg-surface-2 px-3 py-2 leading-snug">
              &ldquo;{callQuestion(order, field)}&rdquo;
            </dd>
          </div>
          <p className="text-[12.5px] text-muted">Shares patient initials only. Call may be recorded.</p>
        </dl>
        {blockedReason ? <p className="px-4 pb-2 text-[12.5px] text-yellow">{blockedReason}</p> : null}
        <div className="flex gap-2 border-t border-rule px-4 py-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onStart}
            disabled={starting || !!blockedReason}
            autoFocus
          >
            <Phone size={15} aria-hidden /> {starting ? "Starting…" : "Start call"}
          </Button>
          <Button size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const failed = call.status === "no_answer" || call.status === "failed";
  return (
    <div
      className="space-y-3 rounded-lg border border-rule bg-surface p-4"
      data-testid="call-panel"
      data-status={call.status}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{prescriber}</div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <span className="font-mono">{maskPhone(call.to_number)}</span>
            <span aria-hidden>·</span>
            {NUMBER_SOURCE_LABEL[call.number_source.kind]}
            {call.number_source.agreement ? (
              <span className="inline-flex items-center gap-0.5 text-green" title={call.number_source.detail}>
                <Check size={12} aria-hidden /> sources agree
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-0.5 text-yellow"
                title={call.number_source.detail}
              >
                <TriangleAlert size={12} aria-hidden /> sources disagree
              </span>
            )}
          </div>
        </div>
        <span className="tabular font-mono text-[13px] text-muted" aria-label="Call duration">
          {elapsed(call.started_at, call.ended_at, now)}
        </span>
      </div>

      <Stepper status={call.status} />

      {failed ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red/30 bg-red-bg px-3 py-2 text-[13px] text-red"
        >
          <PhoneOff size={15} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <div className="font-medium">
              {call.status === "no_answer" ? "No one answered." : "The call failed."}
            </div>
            {call.error ? <div>{call.error}</div> : null}
          </div>
        </div>
      ) : null}

      <Transcript lines={call.transcript} live={live} />

      {call.status === "completed" ? (
        <CallResult call={call} field={field} deciding={deciding} onDecide={onDecide} />
      ) : null}

      {failed || (call.status === "completed" && call.decision === "reject") ? (
        <div className="flex gap-2">
          <Button variant="primary" onClick={onStart} disabled={starting || !!blockedReason}>
            <Phone size={14} aria-hidden /> Retry call
          </Button>
          <Button onClick={onResolveManually}>Resolve manually</Button>
        </div>
      ) : null}
    </div>
  );
}
