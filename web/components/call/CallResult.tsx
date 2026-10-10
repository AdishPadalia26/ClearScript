"use client";

import { CircleCheck, CircleHelp, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Call, Field } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { candidateValues } from "@/lib/order";

const OUTCOME = {
  confirmed: { label: "Confirmed", Icon: CircleCheck, cls: "bg-green-bg text-green border-green/30" },
  unclear: { label: "Unclear", Icon: CircleHelp, cls: "bg-yellow-bg text-yellow border-yellow/30" },
  refused: { label: "Refused", Icon: Ban, cls: "bg-red-bg text-red border-red/30" },
} as const;

export function CallResult({
  call,
  field,
  deciding,
  onDecide,
}: {
  call: Call;
  field: Field;
  deciding: boolean;
  onDecide: (d: "accept" | "reject") => void;
}) {
  const r = call.result;
  if (!r) return null;
  const { label, Icon, cls } = OUTCOME[r.outcome];
  const cands = candidateValues(field).filter((v) => v !== r.confirmed_value);
  return (
    <div className="rounded-lg border border-rule p-4" data-testid="call-result">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] font-medium",
            cls,
          )}
        >
          <Icon size={13} aria-hidden /> {label}
        </span>
        {r.confirmed_by ? <span className="text-[12.5px] text-muted">by {r.confirmed_by}</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-[12px] text-muted">Office says</div>
          <div className="font-mono text-[28px] leading-tight font-medium">{r.confirmed_value ?? "—"}</div>
        </div>
        {cands.length ? (
          <div>
            <div className="text-[12px] text-muted">Fax read as</div>
            <div className="font-mono text-[16px] text-muted line-through decoration-1">
              {cands.join(" · ")}
            </div>
          </div>
        ) : null}
      </div>
      {r.notes ? <p className="mt-2 text-[13px] text-muted">{r.notes}</p> : null}

      {call.decision ? (
        <p className="mt-4 text-[13px] font-medium">
          {call.decision === "accept"
            ? "Answer accepted. The field is updated."
            : "Answer rejected. The field keeps its flag."}
        </p>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            size="lg"
            disabled={deciding || !r.confirmed_value}
            onClick={() => onDecide("accept")}
          >
            Accept answer
          </Button>
          <Button size="lg" disabled={deciding} onClick={() => onDecide("reject")}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
