import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import type { Triage } from "@/lib/api/types";
import { cn } from "@/lib/cn";

// Color is never the only signal: every triage state carries an icon and a word (WCAG 1.4.1).
export const TRIAGE_META = {
  red: {
    label: "Blocks approval",
    short: "Blocking",
    Icon: OctagonAlert,
    cls: "bg-red-bg text-red border-red/30",
  },
  yellow: {
    label: "Check",
    short: "Check",
    Icon: TriangleAlert,
    cls: "bg-yellow-bg text-yellow border-yellow/30",
  },
  green: {
    label: "Verified",
    short: "Verified",
    Icon: CircleCheck,
    cls: "bg-green-bg text-green border-green/25",
  },
} as const satisfies Record<Triage, unknown>;

export function TriageBadge({
  triage,
  compact,
  className,
}: {
  triage: Triage;
  compact?: boolean;
  className?: string;
}) {
  const { label, short, Icon, cls } = TRIAGE_META[triage];
  return (
    <span
      data-triage={triage}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[12px] font-medium whitespace-nowrap",
        cls,
        className,
      )}
    >
      <Icon size={13} aria-hidden strokeWidth={2.25} />
      {compact ? short : label}
    </span>
  );
}

export function FlagChips({ red, yellow }: { red: number; yellow: number }) {
  if (!red && !yellow) return <span className="text-[12.5px] text-faint">None</span>;
  return (
    <span className="inline-flex gap-1.5">
      {red ? (
        <span className="tabular inline-flex h-6 items-center gap-1 rounded-full border border-red/30 bg-red-bg px-2 text-[12px] font-medium text-red">
          <OctagonAlert size={12} aria-hidden /> {red}
          <span className="sr-only"> blocking</span>
        </span>
      ) : null}
      {yellow ? (
        <span className="tabular inline-flex h-6 items-center gap-1 rounded-full border border-yellow/30 bg-yellow-bg px-2 text-[12px] font-medium text-yellow">
          <TriangleAlert size={12} aria-hidden /> {yellow}
          <span className="sr-only"> to check</span>
        </span>
      ) : null}
    </span>
  );
}
