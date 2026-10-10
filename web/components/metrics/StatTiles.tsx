import type { Metrics } from "@/lib/api/types";
import { pct, usd } from "@/lib/format";
import { getSystem, improvement } from "@/lib/metrics";

function Tile({ label, value, naive, note }: { label: string; value: string; naive?: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 border-l border-rule px-5 py-1 first:border-l-0 first:pl-0">
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className="tabular font-mono text-[26px] leading-tight font-medium">{value}</dd>
      <dd className="text-[13px] text-muted">
        {naive ? <>Naive {naive} · </> : null}
        {note}
      </dd>
    </div>
  );
}

export function StatTiles({ m }: { m: Metrics }) {
  const cs = getSystem(m, "clearscript");
  const nv = getSystem(m, "naive");
  if (!cs) return null;
  const x = nv ? improvement(nv.silent_error_rate, cs.silent_error_rate) : null;
  const n = `n=${m.n_faxes} faxes`;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,1.1fr)_2fr]">
      {/* The headline: silent errors, ours vs naive. */}
      <div className="rounded-lg border border-rule bg-surface p-5" data-testid="hero-stat">
        <h2 className="text-[15px] font-medium text-muted">Silent error rate</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Wrong values that reached an approved order without a flag
        </p>
        <div className="mt-4 flex items-end gap-8">
          <div>
            <div className="tabular font-mono text-[52px] leading-none font-medium text-series-1">
              {pct(cs.silent_error_rate, 1)}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[14px]">
              <span className="size-2.5 rounded-sm bg-series-1" aria-hidden /> ClearScript
            </div>
          </div>
          {nv ? (
            <div>
              <div className="tabular font-mono text-[34px] leading-none text-series-2">
                {pct(nv.silent_error_rate, 1)}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[14px]">
                <span className="size-2.5 rounded-sm bg-series-2" aria-hidden /> Naive pipeline
              </div>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-[14px]">
          {x ? (
            <>
              <strong className="font-semibold">{x.toFixed(0)}× fewer</strong> silent errors on the held-out
              split ({n}, {m.n_fields.toLocaleString()} fields).
            </>
          ) : (
            n
          )}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-y-5 rounded-lg border border-rule bg-surface p-5 xl:grid-cols-4">
        <Tile
          label="Trap catch rate"
          value={pct(cs.trap_catch_rate)}
          naive={nv && pct(nv.trap_catch_rate)}
          note={n}
        />
        <Tile
          label="Flag rate"
          value={pct(cs.flag_rate)}
          naive={nv && pct(nv.flag_rate)}
          note={`${pct(cs.flag_precision)} of flags were real`}
        />
        <Tile
          label="Cost per fax"
          value={usd(cs.cost_per_fax_usd)}
          naive={nv && usd(nv.cost_per_fax_usd)}
          note={n}
        />
        <Tile
          label="Median latency"
          value={`${cs.p50_latency_s.toFixed(1)} s`}
          naive={nv && `${nv.p50_latency_s.toFixed(1)} s`}
          note={n}
        />
      </dl>
    </div>
  );
}
