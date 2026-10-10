"use client";

import dynamic from "next/dynamic";
import { OctagonAlert, RotateCw } from "lucide-react";
import { AblationTable } from "@/components/metrics/AblationTable";
import { StatTiles } from "@/components/metrics/StatTiles";
import { Button } from "@/components/ui/button";
import { useMetrics } from "@/lib/api/hooks";
import { isMock } from "@/lib/env";
import { pct } from "@/lib/format";
import { getSystem } from "@/lib/metrics";

// Recharts is the heaviest dependency in the app; keep it in its own chunk, off every other route.
const chartFallback = () => <div className="skeleton h-[300px]" aria-hidden />;
const TradeoffChart = dynamic(() => import("@/components/metrics/TradeoffChart"), {
  ssr: false,
  loading: chartFallback,
});
const ReliabilityChart = dynamic(() => import("@/components/metrics/ReliabilityChart"), {
  ssr: false,
  loading: chartFallback,
});

function Panel({
  title,
  sub,
  children,
  testId,
}: {
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-lg border border-rule bg-surface p-5" data-testid={testId}>
      <h2 className="text-[16px] font-semibold">{title}</h2>
      {sub ? <div className="mt-0.5 text-[14px] text-muted">{sub}</div> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-[14px]">
      {items.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Demo hook: what a single-model pipeline confidently ships for the smudged fax. Static by design. */
function NaiveCard() {
  return (
    <section
      className="grid gap-4 rounded-lg border border-rule bg-surface p-5 md:grid-cols-2"
      data-testid="naive-card"
    >
      <div>
        <h2 className="text-[14px] text-muted">A naive pipeline ships</h2>
        <p className="mt-1 font-mono text-[22px]">Metformin HCl 850 mg</p>
        <p className="mt-1 text-[14px] text-muted">Model confidence 94%. No flag. Sent to fill.</p>
      </div>
      <div className="border-rule md:border-l md:pl-5">
        <h2 className="text-[14px] text-muted">ClearScript</h2>
        <p className="mt-1 flex items-center gap-2 font-mono text-[22px]">
          <OctagonAlert size={18} className="text-red" aria-label="Blocked" /> Strength blocked
        </p>
        <p className="mt-1 text-[14px] text-muted">
          Readers split 850 / 500. Office confirmed 500 mg by phone before approval.
        </p>
      </div>
    </section>
  );
}

export default function MetricsPage() {
  const { data: m, isPending, isError, error, refetch } = useMetrics();

  if (isPending) {
    return (
      <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading metrics">
        <div className="skeleton h-40" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-[340px]" />
          <div className="skeleton h-[340px]" />
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">Couldn&apos;t load benchmark metrics.</p>
        <p className="text-muted">{error.message}</p>
        <Button onClick={() => refetch()}>
          <RotateCw size={14} aria-hidden /> Try again
        </Button>
      </div>
    );
  }

  const cs = getSystem(m, "clearscript");
  const generated = new Date(m.generated_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] space-y-5 p-6 text-[14px]">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[20px] font-semibold">Benchmark</h1>
          <span className="text-muted">
            Held-out split, {m.n_faxes} faxes, {m.n_fields.toLocaleString()} fields
          </span>
          {isMock ? (
            <span
              className="rounded border border-yellow/40 bg-yellow-bg px-1.5 py-0.5 font-mono text-[12px] font-medium text-yellow"
              data-testid="mock-label"
            >
              MOCK DATA
            </span>
          ) : null}
        </div>

        <NaiveCard />
        <StatTiles m={m} />

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title="Flags vs silent errors"
            sub="Each point is a confidence threshold. Lower-left is better."
            testId="tradeoff"
          >
            <Legend
              items={[
                ["ClearScript", "var(--series-1)"],
                ["Naive pipeline", "var(--series-2)"],
              ]}
            />
            <TradeoffChart m={m} />
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted">Show data</summary>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="font-medium">Threshold</th>
                    <th className="font-medium">Flag rate</th>
                    <th className="font-medium">Silent errors</th>
                  </tr>
                </thead>
                <tbody className="tabular font-mono">
                  {m.tradeoff.map((t) => (
                    <tr key={t.threshold}>
                      <td>{t.threshold.toFixed(2)}</td>
                      <td>{pct(t.flag_rate, 1)}</td>
                      <td>{pct(t.silent_error_rate, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Panel>
          <Panel
            title="Is the confidence honest?"
            sub="When ClearScript says 90%, it should be right about 90% of the time. Fainter bars have fewer fields."
            testId="reliability"
          >
            <ReliabilityChart m={m} ece={cs?.ece ?? null} />
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted">Show data</summary>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="font-medium">Confidence</th>
                    <th className="font-medium">Accuracy</th>
                    <th className="font-medium">Fields</th>
                  </tr>
                </thead>
                <tbody className="tabular font-mono">
                  {m.reliability.map((b) => (
                    <tr key={b.bin_mid}>
                      <td>{pct(b.bin_mid)}</td>
                      <td>{pct(b.accuracy, 1)}</td>
                      <td>{b.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Panel>
        </div>

        <Panel
          title="What each part is worth"
          sub="Remove one component at a time and re-run the benchmark. Sorted by silent error rate."
          testId="ablation"
        >
          <AblationTable m={m} />
        </Panel>

        <p className="text-[13px] text-muted">
          Synthetic benchmark, held-out split, generated {generated}. Real-fax pilot pending.
        </p>
      </div>
    </div>
  );
}
