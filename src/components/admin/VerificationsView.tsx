"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Inbox } from "lucide-react";
import { adminFetch } from "@/lib/admin/client";
import { formatPhone } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button, Card, Skeleton, useNotify } from "./ui";

type Status = "PENDING" | "APPROVED" | "REJECTED";

interface Submission {
  userId: string;
  username: string | null;
  phone: string | null;
  site: string | null;
  status: Status;
  note: string | null;
  submittedAt: string;
  idUrl: string | null;
  addressUrl: string | null;
}

/**
 * ID + proof-of-address review. Links are signed for ten minutes, so the list
 * refetches whenever the filter changes rather than being cached.
 */
export function VerificationsView({ onUnauthorised }: { onUnauthorised: () => void }) {
  const notify = useNotify();
  const [status, setStatus] = useState<Status>("PENDING");
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const response = await adminFetch(`/api/admin/verifications?status=${status}`).catch(() => null);
    if (response?.status === 401) return onUnauthorised();
    const body = response
      ? ((await response.json().catch(() => ({}))) as { verifications?: Submission[]; error?: string })
      : { error: "Could not reach the backend" };
    if (!response?.ok) {
      setError(body.error ?? "Could not load");
      setRows([]);
      return;
    }
    setError(null);
    setRows(body.verifications ?? []);
  }, [status, onUnauthorised]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(userId: string, next: "APPROVED" | "REJECTED") {
    const note =
      next === "REJECTED"
        ? (window.prompt("Reason shown to the customer", "Please upload clearer documents.") ?? null)
        : null;
    if (next === "REJECTED" && note === null) return;
    setBusy(userId);
    const response = await adminFetch(`/api/admin/verifications/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next, note }),
    }).catch(() => null);
    setBusy(null);
    if (!response?.ok) {
      notify({ tone: "error", title: "Could not update" });
      return;
    }
    notify({ tone: "success", title: next === "APPROVED" ? "Approved" : "Rejected" });
    setRows((current) => (current ?? []).filter((row) => row.userId !== userId));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "h-8 rounded-none border px-3 text-[12.5px] font-medium transition-colors",
              status === s
                ? "border-adm-ink bg-adm-ink text-white"
                : "border-adm-line-strong bg-adm-surface text-adm-ink-2 hover:text-adm-ink",
            )}
          >
            {s === "PENDING" ? "Pending" : s === "APPROVED" ? "Approved" : "Rejected"}
          </button>
        ))}
      </div>

      {error ? <Card className="p-4 text-[13px] text-adm-neg">{error}</Card> : null}

      {rows === null ? (
        <Skeleton className="h-24" />
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Inbox size={20} className="text-adm-ink-4" />
          <div className="text-[13.5px] font-medium text-adm-ink">Nothing to review</div>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.userId} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-adm-ink">{row.username ?? "—"}</div>
              <div className="tnum font-mono text-[11.5px] text-adm-ink-3">
                {row.phone ? formatPhone(row.phone) : "No number"} ·{" "}
                {new Date(row.submittedAt).toLocaleString([], {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {row.note ? <div className="mt-1 text-[12px] text-adm-ink-3">{row.note}</div> : null}
            </div>
            <DocLink href={row.idUrl} label="National ID" />
            <DocLink href={row.addressUrl} label="Proof of address" />
            {status === "PENDING" ? (
              <>
                <Button
                  variant="primary"
                  disabled={busy === row.userId}
                  onClick={() => void decide(row.userId, "APPROVED")}
                >
                  Approve
                </Button>
                <Button disabled={busy === row.userId} onClick={() => void decide(row.userId, "REJECTED")}>
                  Reject
                </Button>
              </>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}

function DocLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-[12px] text-adm-ink-4">{label} missing</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 border border-adm-line-strong px-2 py-1 text-[12px] text-adm-ink-2 hover:border-adm-accent hover:text-adm-ink"
    >
      {label}
      <ExternalLink size={12} />
    </a>
  );
}
