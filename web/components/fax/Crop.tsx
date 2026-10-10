"use client";

import { memo, useEffect, useRef, useState } from "react";
import { cropRect, type BBox } from "@/lib/geometry";

// One decode per page image, shared by every crop on screen.
const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // must match the viewer's <img> so the cache entry is shared
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    p.catch(() => images.delete(src));
    images.set(src, p);
  }
  return p;
}

/**
 * The exact pixels a reader looked at. Uses the server crop when provided; otherwise draws the
 * bbox region (8% padding, clamped to the page) onto a canvas at device-pixel resolution.
 */
export const Crop = memo(function Crop({
  pageSrc,
  bbox,
  cropUrl,
  height = 52,
  maxWidth = 240,
  label,
}: {
  pageSrc: string;
  bbox: BBox;
  cropUrl?: string | null;
  height?: number;
  maxWidth?: number;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (cropUrl) return;
    let cancelled = false;
    loadImage(pageSrc)
      .then((img) => {
        const c = canvas.current;
        if (cancelled || !c) return;
        const nw = img.naturalWidth || 850;
        const nh = img.naturalHeight || 1100;
        const { sx, sy, sw, sh } = cropRect(bbox, nw, nh);
        const cssH = height;
        const cssW = Math.min(maxWidth, Math.round((sw / sh) * cssH));
        const dpr = window.devicePixelRatio || 1;
        c.width = Math.round(cssW * dpr);
        c.height = Math.round(cssH * dpr);
        c.style.width = `${cssW}px`;
        c.style.height = `${cssH}px`;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingQuality = "high";
        // Preserve aspect: if the crop was width-capped, letterbox vertically.
        const scale = Math.min(c.width / sw, c.height / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        ctx.fillStyle = "#fbfaf6";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, sx, sy, sw, sh, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
        setState("ok");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [pageSrc, bbox, cropUrl, height, maxWidth]);

  if (cropUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- server-generated crop
      <img
        src={cropUrl}
        alt={label}
        style={{ height, maxWidth }}
        className="rounded border border-rule bg-white object-contain"
      />
    );
  }
  if (state === "error") return <span className="text-[12px] text-faint">Crop unavailable</span>;
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      data-testid="crop"
      style={{ height, width: state === "loading" ? 120 : undefined }}
      className={state === "loading" ? "skeleton rounded" : "rounded border border-rule"}
    />
  );
});
