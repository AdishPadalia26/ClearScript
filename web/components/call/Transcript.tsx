"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "@/lib/api/types";
import { cn } from "@/lib/cn";

export function Transcript({ lines, live }: { lines: TranscriptLine[]; live: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [lines.length]);

  return (
    <div
      className="max-h-64 space-y-2 overflow-y-auto rounded-md bg-surface-2 p-3"
      aria-live="polite"
      aria-label="Call transcript"
      data-testid="transcript"
    >
      {lines.length === 0 ? (
        <p className="text-[12.5px] text-faint">
          {live ? "Waiting for the office to pick up…" : "No transcript."}
        </p>
      ) : null}
      {lines.map((l, i) => (
        <div key={i} className={cn("flex", l.role === "office" ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug",
              l.role === "agent"
                ? "rounded-bl-sm bg-surface text-ink shadow-[0_1px_0_var(--rule)]"
                : "rounded-br-sm bg-accent text-accent-ink",
            )}
          >
            <span className="sr-only">{l.role === "agent" ? "ClearScript agent: " : "Office: "}</span>
            {l.text}
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
