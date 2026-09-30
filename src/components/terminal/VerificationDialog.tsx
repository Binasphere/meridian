"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Clock, FileUp, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/ui";
import {
  DOCUMENT_ACCEPT,
  myVerification,
  submitVerification,
  type Verification,
} from "@/lib/verification";
import { Spinner } from "@/components/ui/Spinner";

/** Two documents, both required, one submit. */
export function VerificationDialog() {
  const open = useUi((s) => s.verificationOpen);
  const setOpen = useUi((s) => s.setVerificationOpen);

  const [state, setState] = useState<Verification | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIdFile(null);
    setAddressFile(null);
    setError(null);
    setState(null);
    void myVerification().then(setState);
  }, [open]);

  const submit = async () => {
    if (!idFile || !addressFile) return;
    setBusy(true);
    setError(null);
    const result = await submitVerification(idFile, addressFile);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setState({ status: "PENDING", note: null });
    toast.success("Documents submitted");
  };

  const canUpload = state && (state.status === "NONE" || state.status === "REJECTED");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "dialog-pop fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-[380px]",
            "-translate-x-1/2 -translate-y-1/2 border border-line bg-surface-1 shadow-2xl focus:outline-none",
          )}
        >
          <div className="flex h-12 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="text-[14px] font-semibold text-ink">Verification</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Upload your national ID and proof of address.
          </Dialog.Description>

          <div className="p-4">
            {state === null ? (
              <div className="grid place-items-center py-8">
                <Spinner size={28} label="Loading" />
              </div>
            ) : state.status === "APPROVED" ? (
              <Status icon={<CheckCircle2 className="h-7 w-7 text-up" />} title="Verified" />
            ) : state.status === "PENDING" ? (
              <Status icon={<Clock className="h-7 w-7 text-warning" />} title="Under review" />
            ) : null}

            {canUpload ? (
              <div className="flex flex-col gap-3">
                {state.status === "REJECTED" ? (
                  <p className="text-[12.5px] text-down">
                    {state.note ?? "Please upload clearer documents."}
                  </p>
                ) : null}

                <UploadTile label="National ID" file={idFile} onFile={setIdFile} />
                <UploadTile label="Proof of address" file={addressFile} onFile={setAddressFile} />

                {error ? (
                  <p role="alert" className="text-[12.5px] text-down">
                    {error}
                  </p>
                ) : null}

                <button
                  onClick={() => void submit()}
                  disabled={!idFile || !addressFile || busy}
                  className="mt-1 flex h-11 items-center justify-center bg-cash text-[14px] font-semibold text-white transition-colors hover:bg-cash-hover disabled:pointer-events-none disabled:opacity-40"
                >
                  {busy ? <Spinner size={18} onColor /> : "Submit"}
                </button>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Status({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6">
      {icon}
      <div className="text-[15px] font-semibold text-ink">{title}</div>
    </div>
  );
}

function UploadTile({
  label,
  file,
  onFile,
}: {
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      className={cn(
        "flex h-14 w-full items-center gap-3 border px-3 text-left transition-colors",
        file ? "border-cash bg-cash/5" : "border-dashed border-line-strong hover:border-ink-muted",
      )}
    >
      {file ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-cash" aria-hidden />
      ) : (
        <FileUp className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11.5px] text-ink-faint">
          {file ? file.name : "Photo or PDF"}
        </span>
      </span>
      <input
        ref={input}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
    </button>
  );
}
