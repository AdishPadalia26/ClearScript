export type BBox = readonly [number, number, number, number];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Normalized bbox → CSS percentages. Overlays sit in a box with the same aspect as the page,
 * so they track the image at any zoom with no pixel math.
 */
export function bboxToStyle([x0, y0, x1, y1]: BBox) {
  const l = clamp01(Math.min(x0, x1));
  const t = clamp01(Math.min(y0, y1));
  const r = clamp01(Math.max(x0, x1));
  const b = clamp01(Math.max(y0, y1));
  return {
    left: `${l * 100}%`,
    top: `${t * 100}%`,
    width: `${(r - l) * 100}%`,
    height: `${(b - t) * 100}%`,
  } as const;
}

export interface PixelRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Source rect for cropping a bbox out of a page image, padded on each side by `pad` × the box
 * size (min 1% of the page so tiny boxes still get context), clamped to the page edges.
 */
export function cropRect(bbox: BBox, imgW: number, imgH: number, pad = 0.08): PixelRect {
  const [x0, y0, x1, y1] = bbox;
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const px = Math.max(w * pad, 0.01);
  const py = Math.max(h * pad, 0.01);
  const l = clamp01(Math.min(x0, x1) - px);
  const t = clamp01(Math.min(y0, y1) - py);
  const r = clamp01(Math.max(x0, x1) + px);
  const b = clamp01(Math.max(y0, y1) + py);
  const sx = Math.floor(l * imgW);
  const sy = Math.floor(t * imgH);
  return {
    sx,
    sy,
    sw: Math.max(1, Math.ceil(r * imgW) - sx),
    sh: Math.max(1, Math.ceil(b * imgH) - sy),
  };
}
