"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, ScanLine, Square } from "lucide-react";
import { Button, Kbd } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { BBox } from "@/lib/geometry";
import { BoxOverlay, type OverlayBox } from "./BoxOverlay";

const MIN = 0.2;
const MAX = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

interface View {
  scale: number;
  tx: number;
  ty: number;
}

export function FaxViewer({
  src,
  boxes,
  active,
  showAll,
  onToggleShowAll,
  onPick,
  onHover,
  focusBox,
}: {
  src: string;
  boxes: OverlayBox[];
  active: string | null;
  showAll: boolean;
  onToggleShowAll: () => void;
  onPick: (name: string) => void;
  onHover: (name: string | null) => void;
  /** When this changes and the box is off-screen, pan to it. */
  focusBox?: BBox | null;
}) {
  const vp = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState({ w: 850, h: 1100 });
  const [view, setView] = useState<View>({ scale: 0.5, tx: 0, ty: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fitted = useRef(true); // true until the user zooms/pans; then resizes stop refitting
  const viewRef = useRef(view);
  viewRef.current = view;

  const fit = useCallback(() => {
    const el = vp.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const scale = clamp(Math.min((width - 32) / nat.w, (height - 32) / nat.h), MIN, MAX);
    setView({ scale, tx: (width - nat.w * scale) / 2, ty: Math.max(16, (height - nat.h * scale) / 2) });
    fitted.current = true;
  }, [nat]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = vp.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    fitted.current = false;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN, MAX);
      const k = scale / v.scale;
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  }, []);

  const actual = useCallback(() => zoomAt(1 / viewRef.current.scale), [zoomAt]);

  useLayoutEffect(fit, [fit]);

  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitted.current && fit());
    ro.observe(el);
    // Wheel + trackpad pinch (ctrlKey wheel). Non-passive so we can stop page scroll.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [fit, zoomAt]);

  // Drag to pan; two-finger pinch on touch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (ps.size === 2) {
      const other = [...ps.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(next.x - other.x, next.y - other.y);
      const r = vp.current!.getBoundingClientRect();
      if (d0 > 0) zoomAt(d1 / d0, (next.x + other.x) / 2 - r.left, (next.y + other.y) / 2 - r.top);
    } else {
      fitted.current = false;
      setView((v) => ({ ...v, tx: v.tx + next.x - prev.x, ty: v.ty + next.y - prev.y }));
    }
    ps.set(e.pointerId, next);
  };
  const onPointerUp = (e: React.PointerEvent) => void pointers.current.delete(e.pointerId);

  // Bring a focused box into view when zoomed in.
  useEffect(() => {
    const el = vp.current;
    if (!focusBox || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const { scale, tx, ty } = viewRef.current;
    const x0 = tx + focusBox[0] * nat.w * scale;
    const y0 = ty + focusBox[1] * nat.h * scale;
    const x1 = tx + focusBox[2] * nat.w * scale;
    const y1 = ty + focusBox[3] * nat.h * scale;
    if (x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height) return;
    setView((v) => ({
      ...v,
      tx: width / 2 - ((x0 + x1) / 2 - v.tx),
      ty: height / 2 - ((y0 + y1) / 2 - v.ty),
    }));
  }, [focusBox, nat]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-lightbox">
      <div
        ref={vp}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fit}
        role="region"
        aria-roledescription="fax viewer"
        aria-label="Original fax page. Scroll to zoom, drag to pan."
      >
        <div
          className="absolute top-0 left-0 origin-top-left shadow-[0_12px_40px_rgb(0_0_0/0.45)]"
          style={{
            width: nat.w,
            height: nat.h,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          }}
          data-testid="fax-stage"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- API-served page image, not a static asset */}
          <img
            src={src}
            alt=""
            crossOrigin="anonymous"
            draggable={false}
            fetchPriority="high"
            decoding="async"
            width={nat.w}
            height={nat.h}
            onLoad={(e) => {
              const i = e.currentTarget;
              setLoaded(true);
              if (i.naturalWidth && (i.naturalWidth !== nat.w || i.naturalHeight !== nat.h))
                setNat({ w: i.naturalWidth, h: i.naturalHeight });
            }}
            onError={() => setFailed(true)}
            className={cn(
              "block h-full w-full bg-white transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
          {loaded ? (
            <BoxOverlay boxes={boxes} active={active} showAll={showAll} onPick={onPick} onHover={onHover} />
          ) : null}
        </div>
        {!loaded && !failed ? <div className="absolute inset-8 skeleton opacity-20" aria-hidden /> : null}
        {failed ? (
          <div
            role="alert"
            className="absolute inset-0 grid place-items-center p-8 text-center text-lightbox-ink"
          >
            The fax image didn&apos;t load. Field values and their reads are still available on the right.
          </div>
        ) : null}
      </div>

      <div
        className="flex items-center gap-1 border-t border-white/10 px-2 py-1.5 text-lightbox-ink"
        role="toolbar"
        aria-label="Fax view"
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-lightbox-ink hover:bg-white/10"
          onClick={() => zoomAt(1 / 1.25)}
          aria-label="Zoom out"
        >
          <Minus size={14} />
        </Button>
        <span className="tabular w-12 text-center text-[12px]" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-lightbox-ink hover:bg-white/10"
          onClick={() => zoomAt(1.25)}
          aria-label="Zoom in"
        >
          <Plus size={14} />
        </Button>
        <Button variant="ghost" size="sm" className="text-lightbox-ink hover:bg-white/10" onClick={fit}>
          <Maximize size={13} aria-hidden /> Fit
        </Button>
        <Button variant="ghost" size="sm" className="text-lightbox-ink hover:bg-white/10" onClick={actual}>
          <Square size={12} aria-hidden /> 100%
        </Button>
        <Tip
          content={
            <span>
              Show every field&apos;s box <Kbd className="ml-1">B</Kbd>
            </span>
          }
        >
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showAll}
            onClick={onToggleShowAll}
            className={cn("ml-auto text-lightbox-ink hover:bg-white/10", showAll && "bg-white/15 text-white")}
          >
            <ScanLine size={14} aria-hidden /> All boxes
          </Button>
        </Tip>
      </div>
    </div>
  );
}
