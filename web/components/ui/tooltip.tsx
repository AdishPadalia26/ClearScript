"use client";

import * as T from "@radix-ui/react-tooltip";

export const TooltipProvider = T.Provider;

export function Tip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: T.TooltipContentProps["side"];
}) {
  if (!content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-[320px] rounded-md bg-ink px-2.5 py-1.5 text-[12.5px] leading-snug text-bg shadow-pop"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
