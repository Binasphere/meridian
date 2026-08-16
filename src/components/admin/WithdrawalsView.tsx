"use client";

import { useState } from "react";
import { AlertTriangle, CheckCheck, Inbox, Loader2 } from "lucide-react";
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

/**
 * Does this look like an M-Pesa transaction code?
 *
 * Both forms used to accept any non-empty string, and the predictable happened
 * within a day of shipping the bulk action: a batch went through with the word
 * `PAID` in the reference field, so five payouts now carry no way to trace the
 * money that left the till. The reference is the entire point of the step — a
 * field that accepts anything is a field that records nothing.
 *
 * Safaricom codes are ten uppercase alphanumerics (`T93R3LXXPT`). The rule is
 * slightly looser than that — 8 to 15 characters — so a format change does not
 * lock the queue, but it requires **at least one digit**, which is what rejects
 * every English word somebody might type in a hurry.
 */
export function looksLikeReference(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9]{8,15}$/.test(trimmed) && /\d/.test(trimmed);
}

const REFERENCE_HINT =
  "8–15 letters and numbers, at least one digit — the code from the M-Pesa message.";

export function WithdrawalsView({ state }: { state: WithdrawalsState }) {
  const { withdrawals, error, pending, decide } = state;
  const notify = useNotify();
  const [bulkOpen, setBulkOpen] = useState(false);

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
              <div className="flex items-center gap-2">
                <Badge tone="accent">{queue.length} pending</Badge>
                {queue.length > 1 ? (
                  <Button onClick={() => setBulkOpen((value) => !value)}>
                    <CheckCheck size={14} />
                    {bulkOpen ? "Cancel" : "Mark all paid"}
                  </Button>
                ) : null}
              </div>
            ) : null
          }
        />

        {bulkOpen && queue.length > 1 ? (
          <BulkPayPanel queue={queue} state={state} onDone={() => setBulkOpen(false)} />
        ) : null}

        {error ? (
          <EmptyState title="Could not load withdrawals" hint={error} tone="error" />
        ) : withdrawals === null ? (
          <QueueSkeletons />
        ) : queue.length === 0 ? (
          <EmptyState
            title="Everyone has been paid"
            tone="good"
            hint="The payout queue is clear. New requests land here the moment a customer raises one, and the sidebar carries a count so you do not have to keep this page open."
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

      {/* The decided list is gone from the page.
          Fifty rows of "Paid · KSh 1,000 · Ayan · PAID" is not a record
          anybody reads — it is the queue's exhaust, and it pushed the thing
          this page is actually for below the fold. Nothing is deleted: every
          decision is still on its `cash_events` row with its reference and its
          timestamp, so it can come back as a searchable table the day there is
          a payout to look up, which is the only time anyone wants it. */}
      {decided.length > 0 ? (
        <p className="px-1 text-[12.5px] text-adm-ink-3">
          {decided.length.toLocaleString()} decided{" "}
          {decided.length === 1 ? "request is" : "requests are"} on record.
        </p>
      ) : null}
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
  const valid = looksLikeReference(reference);
  const canConfirm = valid && !busy;
  // Only complain once they have typed enough to mean it — a validation error
  // that appears on the first keystroke is noise.
  const showHint = reference.trim().length >= 3 && !valid;

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
          aria-invalid={showHint ? true : undefined}
          disabled={busy}
          className={cn(
            "h-9 w-full max-w-[260px] rounded-none border bg-adm-surface px-3",
            "font-mono text-[12.5px] uppercase tracking-wide text-adm-ink outline-none transition-colors",
            "placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-adm-ink-4",
            "disabled:opacity-50",
            showHint
              ? "border-adm-neg focus:ring-2 focus:ring-[#fdeceb]"
              : "border-adm-line-strong focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
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

      {showHint ? (
        <p role="alert" className="text-[12px] text-adm-neg">
          {REFERENCE_HINT}
        </p>
      ) : null}
    </li>
  );
}


// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * Bulk payout.
 *
 * One reference for the whole batch, because that is the only case where paying
 * in bulk is honest: an admin who sent one M-Pesa batch has one code, and
 * recording it against every request is the truth. Anyone paying individually
 * has a code per payout and should use the per-row form — which is why this
 * says so rather than quietly accepting a blank.
 *
 * It states the count and the total before it will do anything, and the confirm
 * is a second, separate click. This moves real money out of a real till; a
 * control that did it on one press would eventually do it by accident.
 *
 * Failures do not stop the run. Each request is its own movement, and a batch
 * that aborted halfway would leave a queue nobody can read.
 */
function BulkPayPanel({
  queue,
  state,
  onDone,
}: {
  queue: AdminWithdrawal[];
  state: WithdrawalsState;
  onDone: () => void;
}) {
  const notify = useNotify();
  const [reference, setReference] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const total = queue.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  // The same rule as the per-row form. This is the field that let `PAID`
  // through, and it is the one where a bad value costs the whole batch.
  const ready = looksLikeReference(reference);
  const showHint = reference.trim().length >= 3 && !ready;

  async function run() {
    setBusy(true);
    try {
      const { done, failed } = await state.decideMany(
        queue.map((row) => row.id),
        reference.trim(),
      );

      if (failed.length === 0) {
        notify({
          tone: "success",
          title: `${done} ${done === 1 ? "request" : "requests"} marked paid`,
          body: `All recorded against reference ${reference.trim()}.`,
        });
      } else {
        notify({
          tone: "error",
          title: `${done} paid, ${failed.length} could not be`,
          body: `${failed[0]?.reason ?? "Unknown error"} — the rest are still in the queue.`,
        });
      }
      onDone();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="border-b border-adm-line bg-adm-subtle px-5 py-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-adm-neg" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-adm-ink">
            Mark all {queue.length} requests paid —{" "}
            {formatMoney(total, { currency: "KSh" })}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-adm-ink-3">
            Only do this if you sent the money as one M-Pesa batch. One reference
            is recorded against every request, so individual payouts can no
            longer be told apart afterwards — pay those one at a time below.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirming) setConfirming(true);
              else void run();
            }}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <div className="min-w-[200px]">
              <label
                htmlFor="adm-bulk-ref"
                className="mb-1.5 block text-[12px] font-medium text-adm-ink-2"
              >
                M-Pesa reference for the batch
              </label>
              <input
                id="adm-bulk-ref"
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value.toUpperCase());
                  setConfirming(false);
                }}
                placeholder="TG49H2K1LM"
                aria-invalid={showHint ? true : undefined}
                className={cn(
                  "h-9 w-full rounded-none border bg-adm-surface px-3 font-mono text-[13px] uppercase text-adm-ink outline-none",
                  showHint
                    ? "border-adm-neg focus:ring-2 focus:ring-[#fdeceb]"
                    : "border-adm-line-strong focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
                )}
              />
              {showHint ? (
                <p role="alert" className="mt-1 text-[11.5px] text-adm-neg">
                  {REFERENCE_HINT}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={!ready || busy}
              className={cn("h-9", confirming && "bg-adm-neg hover:bg-[#96201a]")}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCheck size={14} />
              )}
              {confirming ? `Yes — pay all ${queue.length}` : "Mark all paid"}
            </Button>

            {confirming ? (
              <Button type="button" onClick={() => setConfirming(false)} className="h-9">
                Cancel
              </Button>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * The empty state.
 *
 * `tone` picks what the emptiness *means*. "Nothing waiting" on a payout queue
 * is the good outcome — everybody has been paid — and drawing it with the same
 * grey shrug as an error made a finished queue look like a broken one.
 */
function EmptyState({
  title,
  hint,
  tone = "neutral",
}: {
  title: string;
  hint: string;
  tone?: "neutral" | "good" | "error";
}) {
  const Icon = tone === "good" ? CheckCheck : tone === "error" ? AlertTriangle : Inbox;

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span
        className={cn(
          "grid h-11 w-11 place-items-center rounded-none",
          tone === "good"
            ? "bg-[#e8f6ef] text-adm-pos"
            : tone === "error"
              ? "bg-[#fdeceb] text-adm-neg"
              : "bg-adm-subtle text-adm-ink-4",
        )}
      >
        <Icon size={19} />
      </span>
      <p className="mt-1 text-[13.5px] font-medium text-adm-ink">{title}</p>
      <p className="max-w-[420px] text-[12.5px] leading-relaxed text-adm-ink-3">
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
