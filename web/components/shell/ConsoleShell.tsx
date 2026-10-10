"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Inbox, Keyboard, Upload, WifiOff } from "lucide-react";
import { useDemo } from "@/app/providers";
import { Button, Kbd } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { UploadDialog } from "@/components/queue/UploadDialog";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { useOrders } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { env, isMock } from "@/lib/env";
import { useHotkeys } from "@/lib/keyboard";
import { useOrdersSocket, useSocketStatus } from "@/lib/realtime";

const NAV = [
  {
    href: "/queue",
    label: "Queue",
    icon: Inbox,
    match: (p: string) => p.startsWith("/queue") || p.startsWith("/orders"),
  },
  { href: "/metrics", label: "Metrics", icon: BarChart3, match: (p: string) => p.startsWith("/metrics") },
] as const;

function LivePill() {
  const s = useSocketStatus();
  const live = s === "live";
  return (
    <Tip
      content={
        live
          ? "Updates arrive in real time."
          : "Live updates are down. Polling every 3 seconds while we reconnect."
      }
    >
      <span
        role="status"
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium",
          live ? "border-green/30 bg-green-bg text-green" : "border-yellow/30 bg-yellow-bg text-yellow",
        )}
      >
        <span
          className={cn("size-1.5 rounded-full", live ? "bg-green" : "bg-yellow animate-pulse")}
          aria-hidden
        />
        {live ? "Live" : s === "connecting" ? "Connecting" : "Reconnecting"}
      </span>
    </Tip>
  );
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  useOrdersSocket();
  const path = usePathname();
  const demo = useDemo();
  const online = useOnline();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: orders } = useOrders();
  const open = orders?.filter((o) => o.status === "blocked" || o.status === "needs_review").length ?? 0;

  useHotkeys({ "?": () => setHelpOpen((v) => !v), u: () => setUploadOpen(true) });

  return (
    <div className="flex h-dvh overflow-hidden">
      <nav
        aria-label="Primary"
        className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-rule bg-surface py-3"
      >
        <Link
          href="/queue"
          className="mb-3 grid size-9 place-items-center rounded-md bg-accent font-mono text-[15px] font-medium text-accent-ink"
          aria-label="ClearScript home"
        >
          Cs
        </Link>
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex w-[56px] flex-col items-center gap-0.5 rounded-md py-2 text-[11.5px] font-medium",
                active ? "bg-accent-bg text-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon size={18} aria-hidden />
              {label}
              {href === "/queue" && open > 0 ? (
                <span className="tabular absolute top-1 right-1.5 min-w-4 rounded-full bg-red px-1 text-center text-[10px] leading-4 text-white">
                  {open}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-rule bg-surface px-4">
          <span className="font-semibold">ClearScript</span>
          <span className="hidden truncate text-muted sm:inline">{env.pharmacyName}</span>
          {isMock ? (
            <span className="dev-only hidden rounded border border-rule-strong px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline">
              MOCK API
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <LivePill />
            <Tip
              content={
                <span>
                  Keyboard shortcuts <Kbd className="ml-1">?</Kbd>
                </span>
              }
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="Keyboard shortcuts"
                onClick={() => setHelpOpen(true)}
              >
                <Keyboard size={17} />
              </Button>
            </Tip>
            <Button variant="primary" onClick={() => setUploadOpen(true)} aria-label="Upload fax">
              <Upload size={15} aria-hidden /> <span className="hidden sm:inline">Upload fax</span>
            </Button>
          </div>
        </header>

        {!online ? (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-yellow/30 bg-yellow-bg px-4 py-2 text-[13px] text-yellow"
          >
            <WifiOff size={15} aria-hidden /> You&apos;re offline. Changes won&apos;t save until the
            connection is back.
          </div>
        ) : null}

        <main className="relative min-h-0 flex-1">{children}</main>
      </div>

      {demo ? (
        <div className="pointer-events-none fixed right-0 bottom-0 z-50 rounded-tl-md bg-ink/85 px-3 py-1 text-[12px] font-medium text-bg">
          Synthetic data
        </div>
      ) : null}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ShortcutsOverlay open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
