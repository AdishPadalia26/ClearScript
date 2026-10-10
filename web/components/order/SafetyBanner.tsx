"use client";

import { useState } from "react";
import { ExternalLink, Info, X } from "lucide-react";
import type { SafetyNotice } from "@/lib/api/types";

export function SafetyBanner({ notices }: { notices: SafetyNotice[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (!notices.length || dismissed) return null;
  return (
    <div
      role="note"
      className="flex items-start gap-2 border-b border-rule bg-accent-bg/60 px-4 py-2 text-[13px]"
    >
      <Info size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <span className="font-medium">Drug safety {notices.length === 1 ? "notice" : "notices"}</span>
        <ul>
          {notices.map((n) => (
            <li key={n.url}>
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
              >
                {n.title} <ExternalLink size={11} aria-hidden />
              </a>
              <span className="ml-1.5 text-muted">
                {n.source}
                {n.date ? `, ${n.date}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 text-muted hover:bg-surface-2"
        aria-label="Dismiss safety notices"
      >
        <X size={14} />
      </button>
    </div>
  );
}
