/** Joins truthy class names. (No tailwind-merge: callers don't pass conflicting utilities.) */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
