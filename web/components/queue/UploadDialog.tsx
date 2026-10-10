"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUploadFax } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/tiff", "image/png"];
const EXT = /\.(pdf|tiff?|png)$/i;

export function validateFax(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!ACCEPT.includes(file.type) && !EXT.test(file.name)) return "Use a PDF, TIFF or PNG file.";
  if (file.size > MAX_BYTES) return "That file is over 20 MB. Split the fax and upload each part.";
  return null;
}

export function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const upload = useUploadFax();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    (file: File) => {
      const problem = validateFax(file);
      if (problem) return setError(problem);
      setError(null);
      setProgress(0);
      upload.mutate(
        { file, onProgress: setProgress },
        {
          onSuccess: ({ order_ids }) => {
            toast.success(
              `Fax received. ${order_ids.length === 1 ? "1 order is" : `${order_ids.length} orders are`} processing.`,
            );
            setProgress(null);
            onOpenChange(false);
          },
          onError: (e) => {
            setProgress(null);
            setError(e.message);
          },
        },
      );
    },
    [upload, onOpenChange],
  );

  const busy = progress !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent
        title="Upload a fax"
        description="PDF, TIFF or PNG, up to 20 MB. Each prescription on it becomes an order."
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) send(f);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            drag ? "border-accent bg-accent-bg" : "border-rule-strong hover:bg-surface-2",
            busy && "pointer-events-none opacity-70",
          )}
        >
          {busy ? (
            <Loader2 className="animate-spin text-accent" size={26} aria-hidden />
          ) : (
            <FileUp className="text-muted" size={26} aria-hidden />
          )}
          <span className="font-medium">{busy ? "Uploading…" : "Drop the fax here, or choose a file"}</span>
          <input
            ref={input}
            type="file"
            data-testid="fax-input"
            accept=".pdf,.tif,.tiff,.png,application/pdf,image/tiff,image/png"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) send(f);
              e.target.value = "";
            }}
          />
        </label>

        {busy ? (
          <div
            className="mt-4"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Upload progress"
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-[width] duration-200"
                style={{ width: `${Math.max(4, progress * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red/30 bg-red-bg px-3 py-2 text-[13px] text-red"
          >
            {error}
            <Button size="sm" onClick={() => input.current?.click()}>
              Choose another file
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
