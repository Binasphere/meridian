"use client";

import { useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/auth";
import type { AdminWithdrawal } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Skeleton, useNotify } from "./ui";
import type { WithdrawalsState } from "./useWithdrawals";

/**
 * The payout queue.
 *
 * The manual half of the withdrawal flow: the platform has already held the
 * customer's funds; what happens here is a person sending the money via M-Pesa
 * and recording that they did. The form insists on the M-Pesa reference before
 * "Mark paid" — the reference is the proof the money moved, and a queue where
 * confirming is one bare click is a queue that gets confirmed by accident.
 */

export function WithdrawalsView({ state }: { state: WithdrawalsState }) {
  const { withdrawals, error, pending, decide } = state;
  const notify = useNotify();

  const queue = withdrawals?.filter((w) => w.status === "PENDING") ?? [];
  const decided = withdrawals?.filter((w) => w.status !== "PENDING") ?? [];

  async function submit(
    row: AdminWithdrawal,
    verdict: Parameters<WithdrawalsState["decide"]>[1],
  ) {
    const result = await decide(row.id, verdict);
    const name = row.username !== "—" ? row.username : formatPhone(row.phone);

    if (result.ok) {
      notify({
        tone: "success",
        title:
          verdict.action === "PAID"
            ? `Paid ${formatMoney(row.amountMinor, { currency: "KSh" })} to ${name}`
            : `Request from ${name} rejected`,
        body:
          verdict.action === "PAID"
            ? "The request is closed with the M-Pesa reference."
            : "The held funds are back on the customer's balance.",
      });
    } else {
      notify({ tone: "error", title: "Could not decide the request", body: result.reason });
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader
          title="Awaiting payment"
          subtitle="Funds are already held. Send the money via M-Pesa, then confirm with the reference — or reject to refund."
          action={
            queue.length > 0 ? (
              <Badge tone="accent">{queue.length} pending</Badge>
            ) : null
          }
        />

        {error ? (
          <EmptyState title="Could not load withdrawals" hint={error} />
        ) : withdrawals === null ? (
          <QueueSkeletons />
        ) : queue.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            hint="New withdrawal requests land here the moment a customer raises them. Refresh to check for new ones."
          />
        ) : (
          <ul className="divide-y divide-adm-line">
            {queue.map((row) => (
              <PendingRow
                key={row.id}
                row={row}
                busy={Boolean(pending[row.id])}
                onDecide={(verdict) => void submit(row, verdict)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Decided"
          subtitle="Paid and rejected requests, newest first."
        />
        {decided.length === 0 ? (
          <EmptyState
            title="No decided requests yet"
            hint="Once a request is paid or rejected it moves down here with its outcome."
          />
        ) : (
          <ul className="divide-y divide-adm-line">
            {decided.slice(0, 50).map((row) => (
              <DecidedRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending row: the working surface
// ---------------------------------------------------------------------------

function PendingRow({
  row,
  busy,
  onDecide,
}: {
  row: AdminWithdrawal;
  busy: boolean;
  onDecide: (
    verdict: { action: "PAID"; reference: string } | { action: "REJECT"; reason?: string },
  ) => void;
}) {
  const [reference, setReference] = useState("");
  const canConfirm = reference.trim().length > 0 && !busy;

  return (
    <li className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-adm-ink">
          {formatMoney(row.amountMinor, { currency: "KSh" })}
        </span>
        <span className="text-[13px] text-adm-ink-2">
          {row.username !== "—" ? row.username : "Unnamed account"}
        </span>
        <span className="tnum font-mono text-[12px] text-adm-ink-3">
          {formatPhone(row.phone)}
        </span>
        <span className="ml-auto text-[11.5px] text-adm-ink-4">
          requested{" "}
          {new Date(row.createdAt).toLocaleString([], {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value.toUpperCase())}
          placeholder="M-Pesa reference, e.g. SJ42K9L1MN"
          aria-label="M-Pesa reference"
          disabled={busy}
          className={cn(
            "h-9 w-full max-w-[260px] rounded-none border border-adm-line-strong bg-adm-surface px-3",
            "font-mono text-[12.5px] uppercase tracking-wide text-adm-ink outline-none transition-colors",
            "placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-adm-ink-4",
            "focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
            "disabled:opacity-50",
          )}
        />
        <Button
          variant="primary"
          disabled={!canConfirm}
          onClick={() => onDecide({ action: "PAID", reference: reference.trim() })}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          Mark paid
        </Button>
        <Button
          disabled={busy}
          onClick={() => onDecide({ action: "REJECT" })}
        >
          Reject &amp; refund
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Decided row: the record
// ---------------------------------------------------------------------------

function DecidedRow({ row }: { row: AdminWithdrawal }) {
  const paid = row.status === "COMPLETED";

  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
      <Badge tone={paid ? "positive" : "neutral"}>
        {paid ? "Paid" : "Rejected"}
      </Badge>
      <span className="tnum font-mono text-[13px] text-adm-ink">
        {formatMoney(row.amountMinor, { currency: "KSh" })}
      </span>
      <span className="text-[12.5px] text-adm-ink-2">
        {row.username !== "—" ? row.username : formatPhone(row.phone)}
      </span>
      <span className="tnum font-mono text-[11.5px] text-adm-ink-3">
        {paid ? (row.reference ?? "—") : (row.failureReason ?? "Declined")}
      </span>
      <span className="ml-auto text-[11.5px] text-adm-ink-4">
        {row.settledAt
          ? new Date(row.settledAt).toLocaleString([], {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : ""}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-none bg-adm-subtle text-adm-ink-4">
        <Banknote size={18} />
      </span>
      <p className="mt-1 text-[13.5px] font-medium text-adm-ink">{title}</p>
      <p className="max-w-[400px] text-[12.5px] leading-relaxed text-adm-ink-3">
        {hint}
      </p>
    </div>
  );
}

function QueueSkeletons() {
  return (
    <ul className="divide-y divide-adm-line">
      {[0, 1].map((index) => (
        <li key={index} className="space-y-3 px-5 py-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-full max-w-[420px]" />
        </li>
      ))}
    </ul>
  );
}
