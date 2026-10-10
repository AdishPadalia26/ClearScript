"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metrics } from "@/lib/api/types";
import { pct } from "@/lib/format";

const AXIS = { fontSize: 14, fill: "var(--ink-muted)" };

type Bin = Metrics["reliability"][number];

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Bin }[] }) {
  const b = payload?.[0]?.payload;
  if (!active || !b) return null;
  return (
    <div className="rounded-md border border-rule bg-surface px-3 py-2 text-[13px] shadow-pop">
      <div className="font-medium">Confidence ≈ {pct(b.bin_mid)}</div>
      <div className="tabular text-muted">Actually right {pct(b.accuracy, 1)}</div>
      <div className="tabular text-muted">{b.count.toLocaleString()} fields</div>
    </div>
  );
}

export default function ReliabilityChart({ m, ece }: { m: Metrics; ece: number | null }) {
  const max = Math.max(...m.reliability.map((b) => b.count), 1);
  return (
    <div
      className="relative h-[300px]"
      role="img"
      aria-label="Reliability diagram: predicted confidence against actual accuracy"
    >
      {ece != null ? (
        <div className="absolute top-2 right-6 z-[1] rounded-md border border-rule bg-surface px-2 py-1 text-[14px]">
          ECE <span className="tabular font-mono font-medium">{ece.toFixed(3)}</span>
        </div>
      ) : null}
      {/* The SVG is decorative for AT; the "Show data" table carries the same numbers. */}
      <div aria-hidden className="h-full">
        <ResponsiveContainer>
          <ComposedChart
            data={m.reliability}
            margin={{ top: 24, right: 24, bottom: 24, left: 8 }}
            barCategoryGap={2}
          >
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              type="number"
              dataKey="bin_mid"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => pct(v)}
              tick={AXIS}
              stroke="var(--rule-strong)"
              label={{ value: "Predicted confidence", position: "insideBottom", offset: -14, ...AXIS }}
            />
            <YAxis
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => pct(v)}
              tick={AXIS}
              stroke="var(--rule-strong)"
              width={48}
            />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ]}
              stroke="var(--ink-faint)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: "Perfect calibration",
                position: "insideTopLeft",
                fontSize: 13,
                fill: "var(--ink-muted)",
              }}
            />
            <Bar dataKey="accuracy" radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={22}>
              {m.reliability.map((b) => (
                // Opacity by bin size: sparse bins read as less certain.
                <Cell
                  key={b.bin_mid}
                  fill="var(--series-1)"
                  fillOpacity={0.3 + 0.7 * Math.sqrt(b.count / max)}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
