"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function FhirModal({
  open,
  onOpenChange,
  orderId,
  bundle,
  onNext,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  bundle: Record<string, unknown> | null;
  onNext?: () => void;
}) {
  const json = useMemo(() => (bundle ? JSON.stringify(bundle, null, 2) : ""), [bundle]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the JSON is selectable */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/fhir+json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${orderId}.fhir.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Order approved"
        description="FHIR R4 bundle sent to the pharmacy system."
        className="w-[min(94vw,760px)]"
        data-testid="fhir-modal"
      >
        <pre className="max-h-[52vh] overflow-auto rounded-md bg-surface-2 p-3 font-mono text-[12px] leading-relaxed">
          {json || "Loading…"}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={copy} disabled={!json}>
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{" "}
            {copied ? "Copied" : "Copy JSON"}
          </Button>
          <Button onClick={download} disabled={!json}>
            <Download size={14} aria-hidden /> Download
          </Button>
          {onNext ? (
            <Button variant="primary" className="ml-auto" onClick={onNext} data-autofocus>
              Next order
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
