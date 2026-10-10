"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Inbox, Keyboard, RotateCw, ServerCrash, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDemo } from "@/app/providers";
import { Button, Kbd } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { UploadDialog } from "@/components/queue/UploadDialog";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { UploadContext } from "./upload-context";
import { useOrders } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { useConnection, type ConnectionView } from "@/lib/connection";
import { env, isMock } from "@/lib/env";
import { useHotkeys } from "@/lib/keyboard";
import { useOrdersSocket } from "@/lib/realtime";

const NAV = [
  {
    href: "/queue",
    label: "Queue",
    icon: Inbox,
    match: (p: string) => p.startsWith("/queue") || p.startsWith("/orders"),
  },
  { href: "/metrics", label: "Metrics", icon: BarChart3, match: (p: string) => p.startsWith("/metrics") },
] as const;

const PILL: Record<ConnectionView["kind"], { box: string; dot: string }> = {
  live: { box: "border-green/30 bg-green-bg text-green", dot: "bg-green" },
  // Polling is a normal mode, not a warning: the data is current, just not pushed.
  polling: { box: "border-rule-strong bg-surface text-muted", dot: "bg-faint" },
  connecting: { box: "border-rule-strong bg-surface text-muted", dot: "bg-faint animate-pulse" },
  down: { box: "border-red/30 bg-red-bg text-red", dot: "bg-red animate-pulse" },
};

function ConnectionPill({ view }: { view: ConnectionView }) {
  const s = PILL[view.kind];
  return (
    <Tip content={view.detail}>
      <span
        role="status"
        data-connection={view.kind}
        tabIndex={0}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium",
          s.box,
        )}
      >
        <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
        {view.label}
        <span className="sr-only">. {view.detail}</span>
      </span>
    </Tip>
  );
}

function NavLinks({ path, open, variant }: { path: string; open: number; variant: "rail" | "bar" }) {
  return NAV.map(({ href, label, icon: Icon, match }) => {
    const active = match(path);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex flex-col items-center gap-0.5 rounded-md text-[11.5px] font-medium",
          variant === "rail" ? "w-[56px] py-2" : "h-12 flex-1 justify-center",
          active ? "bg-accent-bg text-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
        )}
      >
        <Icon size={18} aria-hidden />
        {label}
        {href === "/queue" && open > 0 ? (
          <span
            className={cn(
              "tabular absolute min-w-4 rounded-full bg-red px-1 text-center text-[10px] leading-4 text-white",
              variant === "rail" ? "top-1 right-1.5" : "top-1 left-[calc(50%+6px)]",
            )}
          >
            {open}
            <span className="sr-only"> orders need review</span>
          </span>
        ) : null}
      </Link>
    );
  });
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  useOrdersSocket();
  const path = usePathname();
  const demo = useDemo();
  const qc = useQueryClient();
  const connection = useConnection();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [openUpload] = useState(() => () => setUploadOpen(true));
  const { data: orders } = useOrders();
  const open = orders?.filter((o) => o.status === "blocked" || o.status === "needs_review").length ?? 0;

  useHotkeys({ "?": () => setHelpOpen((v) => !v), u: () => setUploadOpen(true) });

  return (
    <div className="flex h-dvh overflow-hidden">
      <nav
        aria-label="Primary"
        className="hidden w-[68px] shrink-0 flex-col items-center gap-1 border-r border-rule bg-surface py-3 sm:flex"
      >
        <Link
          href="/queue"
          className="mb-3 grid size-9 place-items-center rounded-md bg-accent font-mono text-[15px] font-medium text-accent-ink"
          aria-label="ClearScript home"
        >
          Cs
        </Link>
        <NavLinks path={path} open={open} variant="rail" />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-rule bg-surface px-4">
          <span className="font-semibold">ClearScript</span>
          <span className="hidden truncate text-muted md:inline">{env.pharmacyName}</span>
          {isMock ? (
            <span className="dev-only hidden rounded border border-rule-strong px-1.5 py-0.5 font-mono text-[11px] text-muted md:inline">
              MOCK API
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <ConnectionPill view={connection} />
            <span className="hidden sm:inline-flex">
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
            </span>
            <Button variant="primary" onClick={() => setUploadOpen(true)} aria-label="Upload fax">
              <Upload size={15} aria-hidden /> <span className="hidden sm:inline">Upload fax</span>
            </Button>
          </div>
        </header>

        {connection.kind === "down" ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-red/30 bg-red-bg px-4 py-2 text-[13px] text-red"
          >
            <ServerCrash size={15} aria-hidden />
            <span className="min-w-0 flex-1">
              Can&apos;t reach the ClearScript server. Changes won&apos;t save until it&apos;s back; retrying
              every 3 seconds.
            </span>
            <Button size="sm" onClick={() => void qc.refetchQueries({ type: "active" })}>
              <RotateCw size={13} aria-hidden /> Retry now
            </Button>
          </div>
        ) : null}

        <main className="relative min-h-0 flex-1">
          <UploadContext.Provider value={openUpload}>{children}</UploadContext.Provider>
        </main>

        <nav
          aria-label="Primary"
          className="flex shrink-0 gap-1 border-t border-rule bg-surface px-2 py-1 sm:hidden"
        >
          <NavLinks path={path} open={open} variant="bar" />
        </nav>
      </div>

      {demo ? (
        <div className="pointer-events-none fixed right-0 bottom-0 z-50 rounded-tl-md bg-ink/85 px-3 py-1 text-[12px] font-medium text-bg max-sm:bottom-14">
          Synthetic data
        </div>
      ) : null}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ShortcutsOverlay open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
