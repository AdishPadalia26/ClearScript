"use client";

import { memo, useEffect, useRef } from "react";
import { PhoneCall, UserCheck } from "lucide-react";
import type { Field } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { TriageBadge } from "./TriageBadge";

const BAR: Record<Field["triage"], string> = { red: "bg-red", yellow: "bg-yellow", green: "bg-green" };

export const FieldRow = memo(function FieldRow({
  field,
  selected,
  hot,
  onOpen,
  onHover,
}: {
  field: Field;
  selected: boolean;
  /** Its box is lit on the fax (hover or drawer). */
  hot: boolean;
  onOpen: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const prevResolved = useRef(!!field.resolution);
  const justResolved = !prevResolved.current && !!field.resolution;
  useEffect(() => {
    prevResolved.current = !!field.resolution;
  }, [field.resolution]);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const res = field.resolution;
  return (
    <button
      ref={ref}
      type="button"
      id={`field-${field.name}`}
      data-field={field.name}
      data-triage={field.triage}
      aria-current={selected || undefined}
      onClick={() => onOpen(field.name)}
      onMouseEnter={() => onHover(field.name)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(field.name)}
      onBlur={() => onHover(null)}
      className={cn(
        "group grid w-full grid-cols-[minmax(92px,128px)_1fr_auto] items-start gap-x-3 border-l-[3px] px-4 py-2.5 text-left transition-colors duration-150",
        field.triage === "red"
          ? "border-l-red"
          : field.triage === "yellow"
            ? "border-l-yellow"
            : "border-l-transparent",
        selected ? "bg-accent-bg" : hot ? "bg-surface-2" : "hover:bg-surface-2",
        justResolved && "animate-resolved",
      )}
    >
      <span className="pt-0.5 text-[13px] text-muted">{field.label}</span>
      <span className="min-w-0">
        <span className={cn("block font-mono text-[14px] break-words", field.value == null && "text-faint")}>
          {field.value ?? "—"}
          {field.value == null ? <span className="ml-2 font-sans text-[12.5px]">Unreadable</span> : null}
        </span>
        {field.triage !== "green" && field.reasons[0] ? (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{field.reasons[0]}</span>
        ) : null}
        {res ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-green">
            {res.by === "prescriber_call" ? (
              <PhoneCall size={12} aria-hidden />
            ) : (
              <UserCheck size={12} aria-hidden />
            )}
            {res.by === "prescriber_call"
              ? "Confirmed by office"
              : res.action === "edit"
                ? "Edited by pharmacist"
                : "Resolved by pharmacist"}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <TriageBadge triage={field.triage} compact />
        <span
          className="h-1 w-14 overflow-hidden rounded-full bg-surface-2"
          title={`Confidence ${pct(field.confidence)}`}
          aria-label={`Confidence ${pct(field.confidence)}`}
          role="img"
        >
          <span
            className={cn("block h-full rounded-full", BAR[field.triage])}
            style={{ width: pct(field.confidence) }}
          />
        </span>
      </span>
    </button>
  );
});
