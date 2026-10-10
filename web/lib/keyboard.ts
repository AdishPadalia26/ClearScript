"use client";

import { useEffect, useInsertionEffect, useRef } from "react";

/**
 * Hotkey spec: "j", "Enter", "?", "mod+Enter" (mod = ⌘ on mac, Ctrl elsewhere), "shift+x".
 * Letters match case-insensitively; "?" matches the produced character regardless of shift.
 */
export function matchHotkey(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  spec: string,
) {
  const parts = spec.split("+");
  const key = parts.pop()!;
  const mods = new Set(parts);
  const wantMod = mods.has("mod");
  const hasMod = e.metaKey || e.ctrlKey;
  if (wantMod !== hasMod || e.altKey !== mods.has("alt")) return false;
  if (mods.has("shift") && !e.shiftKey) return false;
  if (key.length === 1 && /[a-z]/i.test(key)) {
    if (!mods.has("shift") && e.shiftKey) return false;
    return e.key.toLowerCase() === key.toLowerCase();
  }
  return e.key === key;
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (t as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit"].includes(type);
}

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Global hotkeys. Ignored while typing unless the spec carries a modifier ("mod+Enter").
 * The handler map is read through a ref, so callers can pass a fresh object every render.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  useInsertionEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      // Modal dialogs own the keyboard; the non-modal field drawer does not.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const typing = isTypingTarget(e.target);
      // A focused button/link owns plain Enter; don't double-fire a global action.
      const activatable =
        e.target instanceof HTMLElement && !!e.target.closest("button, a[href], [role=button]");
      for (const [spec, fn] of Object.entries(ref.current)) {
        if (typing && !spec.includes("mod+")) continue;
        if (activatable && spec === "Enter") continue;
        if (matchHotkey(e, spec)) {
          e.preventDefault();
          fn(e);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
