// Synthetic fax pages. The layout below is the single source of truth for both the rendered SVG
// and every Evidence bbox in the fixtures, so overlays line up with the pixels by construction.

export const PAGE_W = 850;
export const PAGE_H = 1100;
const VALUE_X = 250;
const FS = 22; // value font size (monospace → predictable glyph width)
const CHAR_W = FS * 0.6;

export type LineKey =
  | "patient.name"
  | "patient.dob"
  | "patient.address"
  | "drug.name"
  | "drug.strength"
  | "drug.form"
  | "drug.quantity"
  | "drug.refills"
  | "sig.text"
  | "sig.days_supply"
  | "prescriber.name"
  | "prescriber.npi"
  | "prescriber.dea"
  | "prescriber.phone"
  | "meta.date_written"
  | "meta.signature";

const LINES: Record<LineKey, { label: string; y: number }> = {
  "patient.name": { label: "Patient name", y: 222 },
  "patient.dob": { label: "Date of birth", y: 260 },
  "patient.address": { label: "Address", y: 298 },
  "drug.name": { label: "Medication", y: 398 },
  "drug.strength": { label: "Strength", y: 436 },
  "drug.form": { label: "Dosage form", y: 474 },
  "drug.quantity": { label: "Quantity", y: 512 },
  "drug.refills": { label: "Refills", y: 550 },
  "sig.text": { label: "Sig", y: 600 },
  "sig.days_supply": { label: "Days supply", y: 638 },
  "prescriber.name": { label: "Prescriber", y: 738 },
  "prescriber.npi": { label: "NPI", y: 776 },
  "prescriber.dea": { label: "DEA #", y: 814 },
  "prescriber.phone": { label: "Office phone", y: 852 },
  "meta.date_written": { label: "Date written", y: 930 },
  "meta.signature": { label: "Signature", y: 1000 },
};

export type BBox = [number, number, number, number];

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Normalized bbox of `text` (or the substring `sub` within it) on line `key`. */
export function boxFor(key: LineKey, text: string, sub?: string): BBox {
  const { y } = LINES[key];
  if (key === "meta.signature")
    return [r4(VALUE_X / PAGE_W), r4((y - 38) / PAGE_H), r4(560 / PAGE_W), r4((y + 14) / PAGE_H)];
  const start = sub ? Math.max(0, text.indexOf(sub)) : 0;
  const len = sub ? sub.length : text.length;
  const x0 = VALUE_X + start * CHAR_W - 4;
  const x1 = VALUE_X + (start + len) * CHAR_W + 4;
  return [r4(x0 / PAGE_W), r4((y - FS * 0.95) / PAGE_H), r4(x1 / PAGE_W), r4((y + FS * 0.35) / PAGE_H)];
}

export interface FaxSpec {
  clinic: string;
  clinicPhone: string;
  clinicFax: string;
  values: Partial<Record<LineKey, string>>;
  /** Lines rendered smudged (the fax machine ate them). */
  smudged?: LineKey[];
  /** Override what's printed (e.g. a smudged "5" that reads like "8"). */
  printed?: Partial<Record<LineKey, string>>;
  controlled?: boolean;
  seed?: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function faxSvg(spec: FaxSpec): string {
  const seed = spec.seed ?? 3;
  const rows = (Object.keys(LINES) as LineKey[])
    .map((key) => {
      const { label, y } = LINES[key];
      const value = spec.printed?.[key] ?? spec.values[key] ?? "";
      const smudge = spec.smudged?.includes(key);
      const valueEl =
        key === "meta.signature"
          ? `<path d="M${VALUE_X} ${y} c 20 -40 40 -40 50 -5 s 25 25 40 -18 s 30 -10 35 10 s 40 -30 60 -6 s 30 8 60 -4 c 20 -6 40 -2 70 2" fill="none" stroke="#1a1f4d" stroke-width="2.4" stroke-linecap="round"/>`
          : `<text x="${VALUE_X}" y="${y}" class="v"${smudge ? ' filter="url(#smudge)"' : ""}>${esc(value)}</text>`;
      const blot = smudge
        ? `<ellipse cx="${VALUE_X + CHAR_W * 0.6}" cy="${y - FS * 0.35}" rx="${CHAR_W * 1.1}" ry="${FS * 0.55}" fill="#3a3a3a" opacity="0.38" filter="url(#blur)"/>`
        : "";
      return `<text x="60" y="${y}" class="l">${label}</text>${valueEl}${blot}<line x1="${VALUE_X}" x2="790" y1="${y + 8}" y2="${y + 8}" stroke="#d9d9d9"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
<defs>
<filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 0.95"/></filter>
<filter id="smudge"><feTurbulence type="turbulence" baseFrequency="0.08" numOctaves="2" seed="${seed + 7}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="5"/><feGaussianBlur stdDeviation="1.1"/></filter>
<filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>
<style>.l{font:600 15px Arial,Helvetica,sans-serif;fill:#333}.v{font:${FS}px "Courier New",Courier,monospace;fill:#111}.h{font:700 26px Georgia,serif;fill:#111}.s{font:600 13px Arial,sans-serif;fill:#444;letter-spacing:2px}</style>
</defs>
<rect width="100%" height="100%" fill="#fbfaf6"/>
<text x="60" y="34" style="font:12px 'Courier New',monospace;fill:#555">FROM: ${esc(spec.clinicFax)}  ${esc(spec.clinic.toUpperCase())}  PAGE 1/1</text>
<line x1="40" x2="810" y1="44" y2="44" stroke="#999"/>
<text x="60" y="96" class="h">${esc(spec.clinic)}</text>
<text x="60" y="124" style="font:14px Arial,sans-serif;fill:#333">Tel ${esc(spec.clinicPhone)} · Fax ${esc(spec.clinicFax)}</text>
${spec.controlled ? `<rect x="610" y="74" width="190" height="34" fill="none" stroke="#111" stroke-width="2"/><text x="622" y="97" style="font:700 15px Arial,sans-serif">CII · CONTROLLED</text>` : ""}
<text x="60" y="180" class="s">PATIENT</text><text x="60" y="360" class="s">PRESCRIPTION (Rx)</text><text x="60" y="700" class="s">PRESCRIBER</text>
${rows}
<rect width="100%" height="100%" filter="url(#noise)" opacity="0.22"/>
</svg>`;
}
