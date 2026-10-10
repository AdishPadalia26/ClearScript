"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  onOpenAutoFocus,
  ...props
}: D.DialogContentProps & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="anim-fade fixed inset-0 z-40 bg-[rgb(10_16_20/0.45)]" />
      <D.Content
        className={cn(
          "anim-pop fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-rule bg-surface shadow-pop",
          className,
        )}
        // Radix focuses the first tabbable (the ✕) and overrides React's autoFocus. A control marked
        // `data-autofocus` (the dialog's primary action) gets focus instead, so Enter confirms.
        onOpenAutoFocus={(e) => {
          const target = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            "[data-autofocus]",
          );
          if (target) {
            e.preventDefault();
            target.focus();
          }
          onOpenAutoFocus?.(e);
        }}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div>
            <D.Title className="text-[16px] font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-[13px] text-muted">{description}</D.Description>
            ) : null}
          </div>
          <D.Close className="-m-1 rounded p-1 text-muted hover:bg-surface-2" aria-label="Close">
            <X size={16} />
          </D.Close>
        </div>
        <div className="min-h-0 overflow-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/** Right-side drawer. Non-modal so the fax stays interactive while a field is open. */
export function SheetContent({
  title,
  children,
  className,
  ...props
}: D.DialogContentProps & { title: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Content
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          "anim-sheet fixed top-0 right-0 bottom-0 z-30 flex w-[min(100vw,600px)] flex-col border-l border-rule bg-surface shadow-pop",
          className,
        )}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        {children}
      </D.Content>
    </D.Portal>
  );
}
