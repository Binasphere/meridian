"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Download,
  History,
  Mail,
  MessageSquare,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelative } from "@/lib/format";
import {
  DURATIONS,
  instrumentOrDefault,
  KIND_LABEL,
} from "@/lib/market/instruments";
import { formatPhone, useCurrentAccount } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { Empty, Segmented } from "@/components/ui/primitives";
import { StatsPanel } from "@/components/terminal/StatsPanel";
import { CashDialog, CashRow } from "@/components/terminal/CashDialog";
import { Column, Columns, Section } from "./AccountShell";

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

  return (
    <Columns count={3}>
      <Column>
        <Section title="Balances" description="Only Live holds real funds.">
          <BalancesBlock onCash={cash.open} />
        </Section>
      </Column>

      <Column>
        <Section
          title="Deposits & withdrawals"
          description="Money moves to and from your registered number."
          fill
        >
          <MovementsBlock onCash={cash.open} />
        </Section>
      </Column>

      {/* At lg there are two columns, so the statement takes a full-width row
          beneath them. At xl it becomes the third column. */}
      <Column className="lg:col-span-2 xl:col-span-1">
        <StatementSection />
      </Column>

      {cash.element}
    </Columns>
  );
}

function BalancesBlock({
  onCash,
}: {
  onCash: (mode: "deposit" | "withdraw") => void;
}) {
  const balances = useStore((s) => s.balances);
  const accountKind = useStore((s) => s.accountKind);
  const setAccountKind = useStore((s) => s.setAccountKind);

  return (
    <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      {(["DEMO", "LIVE"] as const).map((kind) => (
        <div key={kind} className="p-4">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                kind === "DEMO" ? "bg-accent" : "bg-up",
              )}
              aria-hidden
            />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">
              {kind === "DEMO" ? "Demo" : "Live"}
            </span>
            {kind === accountKind ? (
              <span className="ml-auto text-[9.5px] uppercase tracking-wide text-ink-faint">
                active
              </span>
            ) : (
              <button
                onClick={() => setAccountKind(kind)}
                className="ml-auto text-[11px] text-accent hover:underline"
              >
                Switch
              </button>
            )}
          </div>

          <div className="tnum mt-2 font-mono text-[26px] leading-none text-ink">
            {formatMoney(BigInt(balances[kind]), { currency: "KSh" })}
          </div>

          {kind === "LIVE" ? (
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button
                onClick={() => onCash("deposit")}
                className="flex h-9 items-center gap-1.5 bg-cash px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-cash-hover"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
                Deposit
              </button>
              <button
                onClick={() => onCash("withdraw")}
                className="flex h-9 items-center gap-1.5 border border-line-strong bg-surface-3 px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-4"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
                Withdraw
              </button>
            </div>
          ) : (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">
              Practice funds. Reset any time from Settings.
            </p>
          )}
        </div>
      ))}
    </div>
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
            {account ? formatPhone(account.phone) : "—"}
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
  anchor.download = `meridian-statement-${new Date().toISOString().slice(0, 10)}.csv`;
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

export function PerformancePage() {
  const symbol = useStore((s) => s.symbol);
  const spec = instrumentOrDefault(symbol);
  const breakEven = (1 / (1 + spec.payoutBps / 10_000)) * 100;

  return (
    <Columns count={2}>
      <Column>
        <Section
          title="This session"
          description="Your strike rate against the rate you need to break even."
          fill
        >
          <StatsPanel />
        </Section>
      </Column>

      <Column>
        <Section
          title="Selected market"
          description="The instrument currently on your chart."
          fill
        >
          <dl className="divide-y divide-line">
            <DetailRow label="Instrument" value={spec.displayName} />
            <DetailRow label="Symbol" value={spec.symbol} mono />
            <DetailRow label="Class" value={KIND_LABEL[spec.kind]} />
            <DetailRow
              label="Quoted decimals"
              value={String(spec.precision)}
              mono
            />
            <DetailRow
              label="Payout"
              value={`${spec.payoutBps / 100}%`}
              mono
              tone="up"
            />
            <DetailRow
              label="Break-even win rate"
              value={`${breakEven.toFixed(1)}%`}
              mono
              tone="warning"
            />
            <DetailRow label="Price feed" value="Live" tone="up" />
          </dl>

          <div className="space-y-3 border-t border-line p-4">
            <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-ink-secondary">
              {`${spec.displayName} is quoted live and streams continuously. Settlement uses the price at the exact expiry instant, which is recorded on the contract so any result can be checked.`}
            </p>
            <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-ink-secondary">
              At a {spec.payoutBps / 100}% payout you need to be right{" "}
              <span className="tnum font-mono text-warning">
                {breakEven.toFixed(1)}%
              </span>{" "}
              of the time simply to break even. Below that, a run of contracts
              loses money however the individual results feel.
            </p>
          </div>
        </Section>
      </Column>
    </Columns>
  );
}

// ===========================================================================
// Account — identity, verification, preferences
// ===========================================================================

export function AccountPage() {
  const account = useCurrentAccount();

  const tiers = [
    {
      name: "Tier 1",
      status: "active" as const,
      requirement: "M-Pesa number confirmed",
      daily: "KSh 70,000",
      perTx: "KSh 20,000",
    },
    {
      name: "Tier 2",
      status: "available" as const,
      requirement: "National ID or passport",
      daily: "KSh 300,000",
      perTx: "KSh 150,000",
    },
    {
      name: "Tier 3",
      status: "available" as const,
      requirement: "ID, proof of address, and source of funds",
      daily: "KSh 1,000,000",
      perTx: "KSh 500,000",
    },
  ];

  return (
    <Columns count={3}>
      <Column>
        <Section title="Profile">
          <dl className="divide-y divide-line">
            <DetailRow
              label="M-Pesa number"
              value={account ? formatPhone(account.phone) : "—"}
              mono
            />
            <DetailRow
              label="Member since"
              value={
                account
                  ? new Date(account.createdAt).toLocaleDateString([], {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"
              }
            />
            <DetailRow label="Verification" value="Tier 1" tone="up" />
          </dl>
          <p className="border-t border-line p-4 text-[12px] leading-relaxed text-ink-muted">
            Your M-Pesa number is your account identity and the only number
            money is paid out to. Changing it is a verified action, which is
            what stops funds being redirected if someone gets into your session.
          </p>
        </Section>
      </Column>

      <Column>
        <Section
          title="Verification & limits"
          description="Higher tiers raise your daily and per-transaction limits."
          fill
        >
          <div className="flex items-center gap-3 border-b border-line p-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-up" aria-hidden />
            <div>
              <div className="text-[13.5px] font-medium text-ink">
                Tier 1 verified
              </div>
              <div className="text-[12px] text-ink-muted">
                Your M-Pesa number is confirmed
              </div>
            </div>
          </div>

          <div className="divide-y divide-line">
            {tiers.map((tier) => (
              <div key={tier.name} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink">
                    {tier.name}
                  </span>
                  <span
                    className={cn(
                      "border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                      tier.status === "active"
                        ? "border-up/25 bg-up/10 text-up"
                        : "border-line-strong bg-surface-3 text-ink-muted",
                    )}
                  >
                    {tier.status}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-ink-muted">
                  {tier.requirement}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-faint">
                      Daily limit
                    </dt>
                    <dd className="tnum font-mono text-[13px] text-ink-secondary">
                      {tier.daily}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-faint">
                      Per transaction
                    </dt>
                    <dd className="tnum font-mono text-[13px] text-ink-secondary">
                      {tier.perTx}
                    </dd>
                  </div>
                </dl>
                {tier.status === "available" ? (
                  <button
                    onClick={() =>
                      toast("Verification is not wired up in this build")
                    }
                    className="mt-3.5 h-9 border border-line-strong bg-surface-3 px-4 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-4"
                  >
                    Start {tier.name} verification
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      </Column>

      <Column>
        <SettingsSection />
      </Column>
    </Columns>
  );
}

/** Real preferences bound to the store — not a page of dead switches. */
function SettingsSection() {
  const stakeMinor = useStore((s) => BigInt(s.stakeMinor));
  const setStakeMinor = useStore((s) => s.setStakeMinor);
  const durationSec = useStore((s) => s.durationSec);
  const setDuration = useStore((s) => s.setDuration);
  const chartStyle = useStore((s) => s.chartStyle);
  const setChartStyle = useStore((s) => s.setChartStyle);
  const resetDemo = useStore((s) => s.resetDemo);

  return (
    <Section
      title="Settings"
      description="Defaults for the ticket and the chart."
      fill
    >
      <div className="divide-y divide-line">
        <Field label="Default stake">
          <div className="flex max-w-[220px] items-center gap-2 border border-line bg-surface-2 px-3">
            <span className="font-mono text-[12px] text-ink-muted">KSh</span>
            <input
              inputMode="decimal"
              value={formatMoney(stakeMinor)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setStakeMinor(digits ? BigInt(digits) : 0n);
              }}
              className="tnum w-full bg-transparent py-2.5 font-mono text-[15px] text-ink outline-none"
            />
          </div>
        </Field>

        <Field label="Default expiry">
          <Segmented
            options={DURATIONS.map((d) => ({
              value: d.seconds,
              label: d.label,
            }))}
            value={durationSec}
            onChange={setDuration}
          />
        </Field>

        <Field label="Chart style">
          <Segmented
            options={[
              { value: "candles" as const, label: "Candles" },
              { value: "area" as const, label: "Area" },
            ]}
            value={chartStyle}
            onChange={setChartStyle}
          />
        </Field>

        <Field
          label="Demo balance"
          hint="Restores the practice account to KSh 100,000 and clears its contract history."
        >
          <button
            onClick={() => {
              resetDemo();
              toast.success("Demo balance reset to KSh 100,000.00");
            }}
            className="h-9 border border-line-strong bg-surface-3 px-4 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-4"
          >
            Reset demo balance
          </button>
        </Field>
      </div>
    </Section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="text-[13px] font-medium text-ink">{label}</div>
      {hint ? (
        <p className="mt-1 max-w-[54ch] text-[12px] leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

// ===========================================================================
// Help
// ===========================================================================

export function HelpPage() {
  const faqs = [
    {
      q: "How is a contract decided?",
      a: "At expiry the price at that exact instant is compared with your entry price. Buy wins if it closed above, Sell if it closed below. Both prices are recorded on the contract, so any result can be checked afterwards rather than taken on trust.",
    },
    {
      q: "What happens if it closes exactly at my entry price?",
      a: "The contract ties and your stake is returned in full. It is not scored as a loss.",
    },
    {
      q: "What is the break-even win rate?",
      a: "Because a win pays back less than 100% of your stake as profit, being right half the time loses money over any meaningful number of contracts. At an 85% payout you need to be right 54.1% of the time simply to stay level. Each instrument's exact figure is on the Performance page.",
    },
    {
      q: "How long do deposits take?",
      a: "An M-Pesa STK push arrives on your handset within a few seconds. Once you enter your PIN the balance updates immediately. Withdrawals are sent to the same number your account is registered with.",
    },
    {
      q: "Can I change the number my money is paid to?",
      a: "Not from the payment form. Your M-Pesa number is your account identity, and changing it is a verified account action — this is what prevents funds being redirected if someone gets into your session.",
    },
    {
      q: "Is the demo account the same as the live one?",
      a: "Yes. Identical price engine, identical payouts, identical settlement. It exists to teach you the product, not to give you a flattering experience before you deposit.",
    },
  ];

  return (
    <Columns count={2}>
      <Column>
        <Section title="Common questions" fill>
          <div className="divide-y divide-line">
            {faqs.map((faq) => (
              <details key={faq.q} className="group px-4 py-3.5">
                <summary className="cursor-pointer list-none text-[13.5px] font-medium text-ink marker:hidden">
                  <span className="flex items-start gap-2">
                    <ChevronRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    {faq.q}
                  </span>
                </summary>
                <p className="mt-2.5 max-w-[62ch] pl-6 text-[12.5px] leading-relaxed text-ink-secondary">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </Section>
      </Column>

      <Column>
        <Section title="Contact">
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <button
              onClick={() => toast("Live chat is not wired up in this build")}
              className="flex items-center gap-2.5 bg-surface-1 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
            >
              <MessageSquare
                className="h-4 w-4 shrink-0 text-ink-muted"
                aria-hidden
              />
              <span className="text-[13px] text-ink-secondary">
                Live chat · 24/7
              </span>
            </button>
            <button
              onClick={() =>
                toast("Email support is not wired up in this build")
              }
              className="flex items-center gap-2.5 bg-surface-1 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
            >
              <Mail className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="text-[13px] text-ink-secondary">
                support@meridian.test
              </span>
            </button>
          </div>
        </Section>
      </Column>
    </Columns>
  );
}

function DetailRow({
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
