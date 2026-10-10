"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { CircleCheck, CircleX, ExternalLink, Info, Pencil, Phone, TriangleAlert, X } from "lucide-react";
import { Crop } from "@/components/fax/Crop";
import { TriageBadge } from "./TriageBadge";
import { CallPanel } from "@/components/call/CallPanel";
import { Button, Kbd } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/dialog";
import type { Call, Check, Field, Order } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { pct, SOURCE_LABEL } from "@/lib/format";
import { candidateValues, disagrees, majorityValue } from "@/lib/order";

export type DrawerMode = "view" | "edit" | "call";

const CHECK_ICON: Record<Check["result"], React.ReactNode> = {
  pass: <CircleCheck size={15} className="text-green" aria-label="Pass" />,
  warn: <TriangleAlert size={15} className="text-yellow" aria-label="Warning" />,
  fail: <CircleX size={15} className="text-red" aria-label="Fail" />,
};

function editHint(f: Field): string | null {
  if (f.name.endsWith(".strength")) return "Include the unit, e.g. 500 mg.";
  if (f.name.endsWith(".dob") || f.name.includes("date")) return "MM/DD/YYYY";
  if (f.name.endsWith(".npi")) return "10 digits.";
  if (f.name.endsWith(".dea")) return "2 letters + 7 digits.";
  if (f.name.endsWith(".quantity")) return "Number of units, e.g. 60.";
  return null;
}

function NormalizedDetails({ n }: { n: Record<string, unknown> }) {
  const entries = Object.entries(n);
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
      {entries.map(([k, v]) => {
        const s = String(v);
        const link = k.startsWith("rxcui")
          ? `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${encodeURIComponent(s)}`
          : k === "npi"
            ? `https://npiregistry.cms.hhs.gov/provider-view/${encodeURIComponent(s)}`
            : null;
        return (
          <div key={k} className="contents">
            <dt className="text-muted">
              {k === "rxcui" ? "RxCUI" : k === "npi" ? "NPI" : k.replace(/_/g, " ")}
            </dt>
            <dd className="font-mono">
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
                >
                  {s} <ExternalLink size={12} aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                s
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function EditForm({
  field,
  onSave,
  onCancel,
  saving,
}: {
  field: Field;
  onSave: (v: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [value, setValue] = useState(field.value ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const hint = editHint(field);
  const listId = `cands-${field.name}`;
  return (
    <form
      className="rounded-lg border border-accent/40 bg-accent-bg/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSave(value.trim());
      }}
    >
      <label htmlFor="field-edit" className="text-[12.5px] font-medium">
        Correct value
      </label>
      <div className="mt-1 flex gap-2">
        <input
          ref={input}
          id="field-edit"
          list={listId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-md border border-rule-strong bg-surface px-3 font-mono text-[15px]"
          aria-describedby={hint ? "field-edit-hint" : undefined}
          autoComplete="off"
        />
        <datalist id={listId}>
          {candidateValues(field).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Button type="submit" variant="primary" size="lg" disabled={!value.trim() || saving}>
          Save{" "}
          <Kbd inverse className="ml-1">
            Enter
          </Kbd>
        </Button>
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span id="field-edit-hint">{hint}</span>
        <button type="button" onClick={onCancel} className="hover:text-ink">
          Cancel (Esc)
        </button>
      </div>
    </form>
  );
}

export function FieldDrawer({
  open,
  order,
  field,
  pageSrc,
  mode,
  onModeChange,
  onClose,
  onAccept,
  onEdit,
  resolving,
  call,
  callBlocked,
  starting,
  deciding,
  onStartCall,
  onDecide,
}: {
  open: boolean;
  order: Order;
  field: Field | null;
  pageSrc: string;
  mode: DrawerMode;
  onModeChange: (m: DrawerMode) => void;
  onClose: () => void;
  onAccept: () => void;
  onEdit: (value: string) => void;
  resolving: boolean;
  call: Call | null;
  callBlocked: string | null;
  starting: boolean;
  deciding: boolean;
  onStartCall: () => void;
  onDecide: (d: "accept" | "reject") => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const majority = useMemo(() => (field ? majorityValue(field.reads) : null), [field]);
  const flagged = field ? field.triage !== "green" : false;
  const showCall = !!field && (mode === "call" || !!call);

  return (
    <D.Root open={open} modal={false} onOpenChange={(o) => !o && onClose()}>
      {field ? (
        <SheetContent
          title={`${field.label} details`}
          data-testid="field-drawer"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Focus the panel, not its first button, so Enter means "accept" rather than "click Close".
            e.preventDefault();
            body.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById(`field-${field.name}`)?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(e) => {
            if (mode === "edit") {
              e.preventDefault();
              onModeChange("view");
            }
          }}
        >
          <div ref={body} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
            <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-muted">{field.name}</div>
                <h2 className="text-[17px] font-semibold">{field.label}</h2>
                <div
                  className={cn(
                    "mt-1 font-mono text-[22px] leading-tight break-words",
                    field.value == null && "text-faint",
                  )}
                >
                  {field.value ?? "Unreadable"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <D.Close className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close (Esc)">
                  <X size={17} />
                </D.Close>
                <TriageBadge triage={field.triage} />
                <span className="tabular text-[12px] text-muted">Confidence {pct(field.confidence)}</span>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {field.reasons.length && field.triage !== "green" ? (
                <ol className="space-y-1 text-[13.5px]">
                  {field.reasons.map((r, i) => (
                    <li key={i} className={cn("flex gap-2", i === 0 ? "font-medium" : "text-muted")}>
                      <Info size={14} className="mt-0.5 shrink-0" aria-hidden /> {r}
                    </li>
                  ))}
                </ol>
              ) : null}

              {field.resolution ? (
                <p className="rounded-md bg-green-bg px-3 py-2 text-[13px] text-green">
                  {field.resolution.by === "prescriber_call"
                    ? "Confirmed by the prescriber's office"
                    : field.resolution.action === "edit"
                      ? "Edited by pharmacist"
                      : "Accepted by pharmacist"}
                  {field.resolution.user ? ` (${field.resolution.user})` : ""} at{" "}
                  {new Date(field.resolution.at).toLocaleTimeString()}.
                </p>
              ) : null}

              {mode === "edit" ? (
                <EditForm
                  key={field.name}
                  field={field}
                  saving={resolving}
                  onSave={onEdit}
                  onCancel={() => onModeChange("view")}
                />
              ) : null}

              {showCall ? (
                <CallPanel
                  order={order}
                  field={field}
                  call={call}
                  starting={starting}
                  deciding={deciding}
                  blockedReason={callBlocked}
                  onStart={onStartCall}
                  onDecide={onDecide}
                  onResolveManually={() => onModeChange("edit")}
                  onCancel={() => onModeChange("view")}
                />
              ) : null}

              <section aria-labelledby="reads-h">
                <h3 id="reads-h" className="mb-2 text-[13px] font-semibold">
                  What each reader saw
                </h3>
                <table className="w-full text-[13px]" data-testid="reads-table">
                  <thead>
                    <tr className="border-b border-rule text-left text-[12px] text-muted">
                      <th className="py-1.5 pr-2 font-medium">Source</th>
                      <th className="py-1.5 pr-2 font-medium">Value</th>
                      <th className="py-1.5 pr-2 font-medium">Image</th>
                      <th className="py-1.5 text-right font-medium">OCR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {field.reads.map((r, i) => {
                      const off = disagrees(r, majority);
                      return (
                        <tr
                          key={`${r.source}-${i}`}
                          data-source={r.source}
                          data-disagrees={off || undefined}
                          className={cn("border-b border-rule align-middle", off && "bg-red-bg")}
                        >
                          <td className="py-2 pr-2">
                            <div className="font-medium">{SOURCE_LABEL[r.source]}</div>
                            {r.model ? (
                              <div
                                className="max-w-[140px] truncate text-[11.5px] text-faint"
                                title={r.model}
                              >
                                {r.model}
                              </div>
                            ) : null}
                          </td>
                          <td
                            className={cn("py-2 pr-2 font-mono text-[14px]", off && "font-medium text-red")}
                          >
                            {r.value ?? <span className="text-faint">—</span>}
                            {off ? <span className="ml-1.5 font-sans text-[11.5px]">differs</span> : null}
                          </td>
                          <td className="py-2 pr-2">
                            {r.evidence ? (
                              <Crop
                                pageSrc={pageSrc}
                                bbox={r.evidence.bbox}
                                cropUrl={r.crop_url}
                                label={`${SOURCE_LABEL[r.source]} read “${r.evidence.text_seen}” here`}
                              />
                            ) : (
                              <span className="text-[12px] text-faint">
                                {r.source === "prescriber_call"
                                  ? "Phone answer"
                                  : r.source === "pharmacist"
                                    ? "Typed in"
                                    : "—"}
                              </span>
                            )}
                          </td>
                          <td className="tabular py-2 text-right text-muted">
                            {r.ocr_confidence != null ? `${Math.round(r.ocr_confidence)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {field.checks.length ? (
                <section aria-labelledby="checks-h">
                  <h3 id="checks-h" className="mb-2 text-[13px] font-semibold">
                    Checks
                  </h3>
                  <ul className="space-y-2">
                    {field.checks.map((c, i) => (
                      <li key={i} className="flex gap-2 text-[13px]">
                        <span className="mt-0.5 shrink-0">{CHECK_ICON[c.result]}</span>
                        <div>
                          <span className="font-mono text-[12px] text-muted">{c.rule}</span>
                          {c.severity !== "info" ? (
                            <span
                              className={cn(
                                "ml-2 text-[11.5px] font-medium",
                                c.severity === "red" ? "text-red" : "text-yellow",
                              )}
                            >
                              {c.severity === "red" ? "blocking" : "check"}
                            </span>
                          ) : null}
                          <p className="leading-snug">{c.reason}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {field.normalized && Object.keys(field.normalized).length ? (
                <section aria-labelledby="norm-h">
                  <h3 id="norm-h" className="mb-2 text-[13px] font-semibold">
                    Registry match
                  </h3>
                  <NormalizedDetails n={field.normalized} />
                </section>
              ) : null}
            </div>

            <footer className="flex flex-wrap gap-2 border-t border-rule px-5 py-3">
              <Button
                variant="primary"
                size="lg"
                onClick={onAccept}
                disabled={resolving || !flagged || field.value == null}
                data-testid="accept-field"
              >
                Accept{" "}
                <Kbd inverse className="ml-1">
                  Enter
                </Kbd>
              </Button>
              <Button size="lg" onClick={() => onModeChange("edit")} disabled={mode === "edit"}>
                <Pencil size={14} aria-hidden /> Edit <Kbd className="ml-1">E</Kbd>
              </Button>
              {flagged ? (
                <Button
                  size="lg"
                  onClick={() => onModeChange("call")}
                  disabled={showCall || !!callBlocked}
                  title={callBlocked ?? undefined}
                  data-testid="call-prescriber"
                >
                  <Phone size={14} aria-hidden /> Call prescriber <Kbd className="ml-1">C</Kbd>
                </Button>
              ) : null}
            </footer>
          </div>
        </SheetContent>
      ) : null}
    </D.Root>
  );
}
