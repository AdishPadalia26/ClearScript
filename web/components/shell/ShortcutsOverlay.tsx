"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/button";

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Queue",
    keys: [
      [["↑", "↓"], "Move between orders"],
      [["Enter"], "Open order"],
      [["U"], "Upload a fax"],
    ],
  },
  {
    title: "Order review",
    keys: [
      [["J"], "Next flagged field"],
      [["K"], "Previous flagged field"],
      [["Enter"], "Open field · press again to accept"],
      [["E"], "Edit field"],
      [["C"], "Call prescriber about field"],
      [["B"], "Show all boxes on the fax"],
      [["Ctrl/⌘", "Enter"], "Approve order"],
      [["Esc"], "Close field"],
    ],
  },
  { title: "Anywhere", keys: [[["?"], "Show this help"]] },
];

export function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Keyboard shortcuts" className="w-[min(92vw,460px)]">
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-[13px] font-semibold text-muted">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.keys.map(([keys, what]) => (
                  <div key={what} className="flex items-center justify-between gap-4 text-[13.5px]">
                    <dt>{what}</dt>
                    <dd className="flex gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
