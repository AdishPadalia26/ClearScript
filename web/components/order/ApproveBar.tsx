"use client";

import { useState } from "react";
import { OctagonAlert } from "lucide-react";
import { Button, Kbd } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tip } from "@/components/ui/tooltip";
import type { Field, Order } from "@/lib/api/types";
import { findField, orderedFields } from "@/lib/order";

const REJECT_REASONS = [
  "Illegible; new prescription requested",
  "Invalid or unverifiable prescriber",
  "Duplicate prescription",
  "Clinical concern; prescriber contacted",
  "Other",
];

export const blockingFields = (order: Order): Field[] =>
  orderedFields(order)
    .filter(({ field }) => field.triage === "red")
    .map(({ field }) => field);

export function ApproveBar({
  order,
  approving,
  rejecting,
  confirmOpen,
  onConfirmOpenChange,
  onApprove,
  onReject,
  serverBlocked,
  onJumpTo,
}: {
  order: Order;
  approving: boolean;
  rejecting: boolean;
  confirmOpen: boolean;
  onConfirmOpenChange: (o: boolean) => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  /** Field names from a 409 response. */
  serverBlocked: string[] | null;
  onJumpTo: (name: string) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]!);
  const [detail, setDetail] = useState("");
  const blocking = blockingFields(order);
  const done = order.status === "approved" || order.status === "rejected";
  const disabled = blocking.length > 0 || done || order.status === "processing";
  const v = (n: string) => findField(order, n)?.field.value ?? "—";

  const blockedNames = serverBlocked?.length ? serverBlocked : null;

  return (
    <div className="border-t border-rule bg-surface">
      {blockedNames ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-red/30 bg-red-bg px-4 py-2 text-[13px] text-red"
        >
          <OctagonAlert size={14} aria-hidden /> The server blocked approval. Resolve:
          {blockedNames.map((n) => (
            <button key={n} className="font-medium underline underline-offset-2" onClick={() => onJumpTo(n)}>
              {findField(order, n)?.field.label ?? n}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 text-[13px] text-muted">
          {done
            ? order.status === "approved"
              ? "This order is approved."
              : "This order was rejected."
            : blocking.length
              ? `${blocking.length} blocking field${blocking.length === 1 ? "" : "s"} left.`
              : "All blocking fields are resolved."}
        </p>
        <Button variant="danger" size="lg" onClick={() => setRejectOpen(true)} disabled={done || rejecting}>
          Reject
        </Button>
        <Tip
          content={
            blocking.length ? (
              <span>Resolve first: {blocking.map((f) => f.label).join(", ")}</span>
            ) : done ? null : (
              <span>
                Approve{" "}
                <Kbd inverse className="ml-1">
                  Ctrl/⌘ Enter
                </Kbd>
              </span>
            )
          }
        >
          {/* span wrapper: disabled buttons don't fire pointer events, so the tooltip needs a host */}
          <span tabIndex={disabled ? 0 : -1} className="inline-flex rounded-md">
            <Button
              variant="primary"
              size="lg"
              disabled={disabled || approving}
              onClick={() => onConfirmOpenChange(true)}
              data-testid="approve"
            >
              Approve order
            </Button>
          </span>
        </Tip>
      </div>

      <Dialog open={confirmOpen} onOpenChange={onConfirmOpenChange}>
        <DialogContent
          title="Approve this order?"
          description="It will be sent to the pharmacy system as a FHIR MedicationRequest."
        >
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
            <dt className="text-muted">Patient</dt>
            <dd>
              {v("patient.name")}, DOB <span className="font-mono">{v("patient.dob")}</span>
            </dd>
            <dt className="text-muted">Drug</dt>
            <dd className="font-mono">
              {v("drug.name")} {v("drug.strength")} {v("drug.form")}
            </dd>
            <dt className="text-muted">Directions</dt>
            <dd>{v("sig.text")}</dd>
            <dt className="text-muted">Qty / refills</dt>
            <dd className="font-mono">
              {v("drug.quantity")} / {v("drug.refills")}
            </dd>
            <dt className="text-muted">Prescriber</dt>
            <dd>
              {v("prescriber.name")}, NPI <span className="font-mono">{v("prescriber.npi")}</span>
            </dd>
          </dl>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => onConfirmOpenChange(false)}>Cancel</Button>
            <Button
              variant="primary"
              autoFocus
              disabled={approving}
              onClick={onApprove}
              data-testid="confirm-approve"
            >
              {approving ? "Approving…" : "Approve and send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent title="Reject this order?" description="The reason goes in the audit log.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onReject(detail.trim() ? `${reason}: ${detail.trim()}` : reason);
              setRejectOpen(false);
            }}
            className="space-y-3"
          >
            <label className="block text-[13px] font-medium">
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 block h-9 w-full rounded-md border border-rule-strong bg-surface px-2 font-normal"
              >
                {REJECT_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] font-medium">
              Details {reason === "Other" ? "" : <span className="font-normal text-muted">(optional)</span>}
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                required={reason === "Other"}
                className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 font-normal"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={rejecting}>
                Reject order
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
