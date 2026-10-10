"use client";

import { memo } from "react";
import type { Triage } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { bboxToStyle, type BBox } from "@/lib/geometry";

export interface OverlayBox {
  name: string;
  label: string;
  bbox: BBox;
  triage: Triage;
}

const STROKE: Record<Triage, string> = {
  red: "var(--box-red)",
  yellow: "var(--box-yellow)",
  green: "var(--box-green)",
};

/**
 * Boxes are positioned in percent of the page, inside the same transformed stage as the image,
 * so they stay glued to the pixels at any zoom. Memoized: panning never re-renders this layer.
 */
export const BoxOverlay = memo(function BoxOverlay({
  boxes,
  active,
  showAll,
  onPick,
  onHover,
}: {
  boxes: OverlayBox[];
  active: string | null;
  showAll: boolean;
  onPick: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="box-overlay">
      {boxes.map((b) => {
        const isActive = b.name === active;
        if (!isActive && !showAll) return null;
        const color = STROKE[b.triage];
        return (
          <button
            key={b.name}
            type="button"
            data-box={b.name}
            data-active={isActive || undefined}
            aria-label={`${b.label} on the fax`}
            tabIndex={-1}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onPick(b.name)}
            onMouseEnter={() => onHover(b.name)}
            onMouseLeave={() => onHover(null)}
            style={{ ...bboxToStyle(b.bbox), borderColor: color, ["--c" as string]: color }}
            className={cn(
              "group pointer-events-auto absolute cursor-pointer rounded-[3px] transition-[box-shadow,background-color] duration-150",
              isActive
                ? "z-10 border-2 bg-[color-mix(in_srgb,var(--c)_14%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--c)_30%,transparent)]"
                : "border-[1.5px] hover:bg-[color-mix(in_srgb,var(--c)_12%,transparent)]",
            )}
          >
            <span
              className={cn(
                "absolute bottom-full left-[-2px] mb-[3px] rounded-[3px] px-1.5 py-px font-sans text-[11px] leading-4 font-medium whitespace-nowrap",
                isActive ? "block" : "hidden group-hover:block",
              )}
              // Labels use the darker text tokens (≥4.5:1 against surface ink); strokes stay bright.
              style={{ background: `var(--triage-${b.triage})`, color: "var(--surface)" }}
            >
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
});
