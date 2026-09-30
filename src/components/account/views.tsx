"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ChevronRight,
  ArrowUpFromLine,
  Download,
  History,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelative } from "@/lib/format";
import { formatPhoneMasked, useCurrentAccount } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { currentDomainLabel } from "@/lib/sites";
import { Empty } from "@/components/ui/primitives";
import { Positions } from "@/components/terminal/Positions";
import { CashDialog, CashRow } from "@/components/terminal/CashDialog";
import { Column, Columns, Section } from "./AccountShell";
import { KenyaFlag } from "@/components/terminal/CoinIcon";

/** Opens the deposit/withdraw dialog from anywhere on these pages. */
function useCashDialog() {
  const [mode, setMode] = useState<"deposit" | "withdraw" | null>(null);
  const element = mode ? (
    <CashDialog
      mode={mode}
      open={mode !== null}
      onOpenChange={(next) => !next && setMode(null)}
    />
  ) : null;
  return { open: setMode, element };
}

// ===========================================================================
// Wallet — balances, moving money, and the statement
// ===========================================================================

/**
 * One page, because it is one task.
 *
 * "What have I got", "move some", and "where did it go" are the same question
 * asked three ways. Splitting them across three routes made each page a thin
 * card and put every answer two navigations away from the one before it.
 */
export function WalletPage() {
  const cash = useCashDialog();
  const live = useStore((s) => BigInt(s.balances.LIVE));

  return (
    <div className="max-w-[440px] border border-line bg-surface-1 p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        <KenyaFlag size={18} />
        Live balance
      </div>
      <div className="tnum mt-3 font-mono text-[32px] font-semibold leading-none tracking-tight text-ink">
        {formatMoney(live, { currency: "KSh" })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          onClick={() => cash.open("deposit")}
          className="flex h-11 items-center justify-center gap-1.5 bg-cash text-[14px] font-semibold text-white transition-colors hover:bg-cash-hover"
        >
          <ArrowDownToLine className="h-4 w-4" aria-hidden />
          Deposit
        </button>
        <button
          onClick={() => cash.open("withdraw")}
          className="flex h-11 items-center justify-center gap-1.5 border border-line-strong text-[14px] font-semibold text-ink transition-colors hover:bg-surface-3"
        >
          <ArrowUpFromLine className="h-4 w-4" aria-hidden />
          Withdraw
        </button>
      </div>

      <Link
        href="/transactions"
        className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px] font-medium text-ink-secondary hover:text-ink"
      >
        Transactions
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>

      {cash.element}
    </div>
  );
}

/** Every deposit, withdrawal and contract, newest first. */
export function TransactionsPage() {
  const cash = useCashDialog();
  return (
    <Columns count={2}>
      <Column>
        <Section title="Deposits & withdrawals" fill>
          <MovementsBlock onCash={cash.open} />
        </Section>
      </Column>
      <Column>
        <StatementSection />
      </Column>
      {cash.element}
    </Columns>
  );
}

function MovementsBlock({
  onCash,
}: {
  onCash: (mode: "deposit" | "withdraw") => void;
}) {
  const cashEvents = useStore((s) => s.cashEvents);
  const account = useCurrentAccount();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
            Registered number
          </div>
          <div className="tnum mt-0.5 truncate font-mono text-[14px] text-ink">
            {account ? formatPhoneMasked(account.phone) : "—"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onCash("deposit")}
            className="h-9 bg-cash px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-cash-hover"
          >
            Deposit
          </button>
          <button
            onClick={() => onCash("withdraw")}
            className="h-9 border border-line-strong bg-surface-3 px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-4"
          >
            Withdraw
          </button>
        </div>
      </div>

      {cashEvents.length === 0 ? (
        <Empty
          icon={<Wallet className="h-5 w-5" />}
          title="No deposits or withdrawals yet"
          hint="Each movement is listed here with its M-Pesa reference."
        />
      ) : (
        <div className="divide-y divide-line">
          {cashEvents.slice(0, 25).map((event) => (
            <CashRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------

interface StatementRow {
  id: string;
  at: number;
  type: string;
  detail: string;
  deltaMinor: bigint;
}

function buildStatement(
  cashEvents: ReturnType<typeof useStore.getState>["cashEvents"],
  trades: ReturnType<typeof useStore.getState>["trades"],
): StatementRow[] {
  return [
    ...cashEvents.map((e) => ({
      id: e.id,
      at: e.createdAt,
      type: e.kind === "DEPOSIT" ? "Deposit" : "Withdrawal",
      detail: e.reference ?? "pending",
      deltaMinor:
        e.kind === "DEPOSIT" ? BigInt(e.amountMinor) : -BigInt(e.amountMinor),
    })),
    ...trades
      .filter((t) => t.status !== "OPEN")
      .map((t) => ({
        id: t.id,
        at: t.settledAt ?? t.openedAt,
        type: `${t.direction === "UP" ? "▲" : "▼"} ${t.symbol}`,
        detail:
          t.status === "WON"
            ? "Contract won"
            : t.status === "LOST"
              ? "Contract lost"
              : "Stake refunded",
        deltaMinor: BigInt(t.pnlMinor ?? "0"),
      })),
  ].sort((a, b) => b.at - a.at);
}

/**
 * CSV export.
 *
 * Amounts are written in major units with two decimals and no thousands
 * separators — a grouped "1,234.00" splits across two columns the moment
 * anyone opens the file in a spreadsheet. Fields are quoted and internal quotes
 * doubled, per RFC 4180, because a reference or a symbol should never be able
 * to break the row it sits in.
 */
function downloadStatement(rows: StatementRow[]): void {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const lines = [
    ["Date", "Type", "Detail", "Amount (KES)"].map(escape).join(","),
    ...rows.map((row) =>
      [
        new Date(row.at).toISOString(),
        row.type,
        row.detail,
        `${row.deltaMinor < 0n ? "-" : ""}${(row.deltaMinor < 0n ? -row.deltaMinor : row.deltaMinor) / 100n}.${((row.deltaMinor < 0n ? -row.deltaMinor : row.deltaMinor) % 100n).toString().padStart(2, "0")}`,
      ]
        .map(escape)
        .join(","),
    ),
  ];

  // A BOM, so Excel opens UTF-8 correctly instead of mangling the ▲/▼ glyphs.
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  // Named after the domain it was exported from. A customer holding statements
  // from both products needs to be able to tell them apart in a downloads
  // folder, and a shared brand prefix made every file look like the same one.
  anchor.download = `${currentDomainLabel() ?? "statement"}-statement-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function StatementSection() {
  const cashEvents = useStore((s) => s.cashEvents);
  const trades = useStore((s) => s.trades);
  const rows = buildStatement(cashEvents, trades);

  return (
    <Section
      title="Transaction statement"
      description="Deposits, withdrawals and settled contracts as one ledger."
      fill
      action={
        <button
          onClick={() => {
            if (rows.length === 0) {
              toast("Nothing to export yet");
              return;
            }
            downloadStatement(rows);
            toast.success(`Statement exported · ${rows.length} rows`);
          }}
          className="flex h-8 shrink-0 items-center gap-1.5 border border-line-strong bg-surface-3 px-3 text-[12px] font-medium text-ink transition-colors hover:bg-surface-4"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download CSV
        </button>
      }
    >
      {rows.length === 0 ? (
        <Empty
          icon={<History className="h-5 w-5" />}
          title="No transactions yet"
          hint="Deposits, withdrawals and settled contracts appear here as one ledger."
        />
      ) : (
        <div className="divide-y divide-line">
          {rows.slice(0, 200).map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-ink">{row.type}</div>
                <div className="truncate font-mono text-[11px] text-ink-faint">
                  {row.detail} · {formatRelative(row.at)}
                </div>
              </div>
              <div
                className={cn(
                  "tnum shrink-0 font-mono text-[13px]",
                  row.deltaMinor > 0n && "text-up",
                  row.deltaMinor < 0n && "text-down",
                  row.deltaMinor === 0n && "text-ink-secondary",
                )}
              >
                {formatMoney(row.deltaMinor, { withSign: true })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ===========================================================================
// Performance — results and the market they came from
// ===========================================================================

/**
 * Positions, as a destination.
 *
 * The terminal keeps this list in a panel beside the chart, which a phone has
 * no room for — so on a small screen it lives here, reached from the account
 * menu, and the same component renders it. One implementation of "what are my
 * contracts doing", not a second one written for mobile that drifts.
 *
 * `fill` gives the panel the page's height, so the list scrolls inside its own
 * frame exactly as it does on the desktop.
 */
export function PositionsPage() {
  return (
    <Columns>
      <Column>
        <Section
          title="Your contracts"
          description="Running now, and everything that has settled this session."
          fill
        >
          <div className="min-h-[60vh] lg:h-full lg:min-h-0">
            <Positions />
          </div>
        </Section>
      </Column>
    </Columns>
  );
}

export function DetailRow({
  label,
  value,
  mono = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "up" | "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <dt className="text-[12.5px] text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "text-right text-[13px]",
          mono && "tnum font-mono",
          tone === "up" && "text-up",
          tone === "warning" && "text-warning",
          tone === "neutral" && "text-ink-secondary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
