import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-accent text-accent-ink hover:brightness-110 disabled:bg-surface-2 disabled:text-faint",
  secondary: "bg-surface text-ink border border-rule-strong hover:bg-surface-2 disabled:text-faint",
  ghost: "text-ink hover:bg-surface-2 disabled:text-faint",
  danger: "bg-surface text-red border border-red/40 hover:bg-red-bg disabled:text-faint",
} as const;

const sizes = {
  sm: "h-7 px-2 text-[12.5px] gap-1",
  md: "h-9 px-3 text-[13.5px] gap-1.5",
  lg: "h-11 px-4 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md font-medium whitespace-nowrap transition-[background-color,filter] duration-150 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});

/** Key hint. `inverse` is for use on filled (primary/dark) surfaces. */
export function Kbd({
  children,
  className,
  inverse,
}: {
  children: React.ReactNode;
  className?: string;
  inverse?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-1 font-mono text-[11px] leading-none",
        inverse ? "border-current/40 text-current opacity-80" : "border-rule-strong bg-surface text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
