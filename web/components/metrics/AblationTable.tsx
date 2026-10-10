import type { Metrics } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { pct, usd } from "@/lib/format";
import { systemLabel } from "@/lib/metrics";

export function AblationTable({ m }: { m: Metrics }) {
  const rows = [...m.systems].sort((a, b) => a.silent_error_rate - b.silent_error_rate);
  const max = Math.max(...rows.map((r) => r.silent_error_rate), 1e-9);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[14px]" data-testid="ablation-table">
        <thead>
          <tr className="border-b border-rule text-left text-[13px] text-muted">
            <th className="py-2 pr-3 font-medium">System</th>
            <th className="w-[34%] py-2 pr-3 font-medium">Silent error rate</th>
            <th className="py-2 pr-3 text-right font-medium">Accuracy</th>
            <th className="py-2 pr-3 text-right font-medium">Flag rate</th>
            <th className="py-2 pr-3 text-right font-medium">Trap catch</th>
            <th className="py-2 pr-3 text-right font-medium">ECE</th>
            <th className="py-2 text-right font-medium">Cost / fax</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ours = r.name === "clearscript";
            const naive = r.name === "naive";
            return (
              <tr key={r.name} className={cn("border-b border-rule", ours && "font-medium")}>
                <td className="py-2 pr-3">{systemLabel(r.name)}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular w-12 shrink-0 text-right font-mono">
                      {pct(r.silent_error_rate, 1)}
                    </span>
                    <span className="h-2.5 flex-1">
                      <span
                        className={cn(
                          "block h-full rounded-r",
                          ours ? "bg-series-1" : naive ? "bg-series-2" : "bg-rule-strong",
                        )}
                        style={{ width: `${Math.max(1.5, (r.silent_error_rate / max) * 100)}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="tabular py-2 pr-3 text-right font-mono">{pct(r.field_accuracy, 1)}</td>
                <td className="tabular py-2 pr-3 text-right font-mono">{pct(r.flag_rate, 1)}</td>
                <td className="tabular py-2 pr-3 text-right font-mono">{pct(r.trap_catch_rate)}</td>
                <td className="tabular py-2 pr-3 text-right font-mono">{r.ece.toFixed(3)}</td>
                <td className="tabular py-2 text-right font-mono">{usd(r.cost_per_fax_usd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
