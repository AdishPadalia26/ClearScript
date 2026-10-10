"use client";

import { memo } from "react";
import type { Order } from "@/lib/api/types";
import { SECTION_ORDER } from "@/lib/order";
import { FieldRow } from "./FieldRow";

export const FieldPanel = memo(function FieldPanel({
  order,
  selected,
  hot,
  onOpen,
  onHover,
}: {
  order: Order;
  selected: string | null;
  hot: string | null;
  onOpen: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  return (
    <div>
      {SECTION_ORDER.map(({ group, title }) => {
        const fields = Object.values(order.fields[group] ?? {});
        if (!fields.length) return null;
        return (
          <section key={group} aria-labelledby={`sec-${group}`} className="border-b border-rule">
            <h2
              id={`sec-${group}`}
              className="sticky top-0 z-[1] bg-surface/95 px-4 pt-3 pb-1.5 text-[13px] font-semibold text-ink backdrop-blur"
            >
              {title}
            </h2>
            <div className="pb-1">
              {fields.map((f) => (
                <FieldRow
                  key={f.name}
                  field={f}
                  selected={selected === f.name}
                  hot={hot === f.name}
                  onOpen={onOpen}
                  onHover={onHover}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
});
