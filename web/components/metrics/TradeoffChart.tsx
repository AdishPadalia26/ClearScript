"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metrics } from "@/lib/api/types";
import { pct } from "@/lib/format";
import { getSystem, operatingPoint } from "@/lib/metrics";

const AXIS = { fontSize: 14, fill: "var(--ink-muted)" };

type Point = { flag_rate: number; silent_error_rate: number; threshold?: number; label?: string };

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-md border border-rule bg-surface px-3 py-2 text-[13px] shadow-pop">
      <div className="font-medium">{p.label ?? `Threshold ${p.threshold?.toFixed(2)}`}</div>
      <div className="tabular text-muted">Flag rate {pct(p.flag_rate, 1)}</div>
      <div className="tabular text-muted">Silent errors {pct(p.silent_error_rate, 2)}</div>
    </div>
  );
}

export default function TradeoffChart({ m }: { m: Metrics }) {
  const op = operatingPoint(m);
  const naive = getSystem(m, "naive");
  const curve = [...m.tradeoff].sort((a, b) => a.flag_rate - b.flag_rate);
  return (
    <div className="h-[300px]" role="img" aria-label="Tradeoff between flag rate and silent error rate">
      {/* The SVG is decorative for AT; the "Show data" table carries the same numbers. */}
      <div aria-hidden className="h-full">
        <ResponsiveContainer>
          <ComposedChart margin={{ top: 24, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="var(--rule)" strokeDasharray="0" vertical={false} />
            <XAxis
              type="number"
              dataKey="flag_rate"
              domain={[0, "dataMax"]}
              padding={{ left: 14, right: 8 }}
              tickFormatter={(v: number) => pct(v)}
              tick={AXIS}
              stroke="var(--rule-strong)"
              label={{
                value: "Flag rate (fields sent to a pharmacist)",
                position: "insideBottom",
                offset: -14,
                ...AXIS,
              }}
            />
            <YAxis
              type="number"
              dataKey="silent_error_rate"
              tickFormatter={(v: number) => pct(v, 1)}
              tick={AXIS}
              stroke="var(--rule-strong)"
              width={56}
            />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--rule-strong)" }} />
            <Line
              data={curve}
              dataKey="silent_error_rate"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
              name="ClearScript"
            />
            {naive ? (
              <Scatter
                data={[
                  {
                    flag_rate: naive.flag_rate,
                    silent_error_rate: naive.silent_error_rate,
                    label: "Naive pipeline",
                  },
                ]}
                fill="var(--series-2)"
                shape="diamond"
                isAnimationActive={false}
                name="Naive pipeline"
              />
            ) : null}
            {naive ? (
              <ReferenceDot
                x={naive.flag_rate}
                y={naive.silent_error_rate}
                r={0}
                label={{
                  value: `Naive ${pct(naive.silent_error_rate, 1)}`,
                  position: "right",
                  fontSize: 14,
                  fill: "var(--ink)",
                }}
              />
            ) : null}
            {op ? (
              <ReferenceDot
                x={op.flag_rate}
                y={op.silent_error_rate}
                r={7}
                fill="var(--series-1)"
                stroke="var(--surface)"
                strokeWidth={2}
                label={{
                  value: `Chosen threshold ${op.threshold.toFixed(2)}`,
                  position: "top",
                  offset: 12,
                  fontSize: 14,
                  fill: "var(--ink)",
                }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
