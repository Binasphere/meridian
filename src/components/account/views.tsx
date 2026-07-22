"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  History,
  Mail,
  MessageSquare,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelative } from "@/lib/format";
import { DURATIONS, instrument, KIND_LABEL } from "@/lib/market/instruments";
import { useStore } from "@/lib/store";
import { Empty, Segmented } from "@/components/ui/primitives";
import { StatsPanel } from "@/components/terminal/StatsPanel";
import { CashDialog, CashRow } from "@/components/terminal/CashDialog";

/** Shared: opens the deposit/withdraw dialog from anywhere on these pages. */
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

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export function BalancesView() {
  const balances = useStore((s) => s.balances);
  const accountKind = useStore((s) => s.accountKind);
  const setAccountKind = useStore((s) => s.setAccountKind);
  const cash = useCashDialog();

  return (
    <>
      <div className="divide-y divide-line">
        {(["DEMO", "LIVE"] as const).map((kind) => (
          <div key={kind} className="p-5">
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
                  Switch to this account
                </button>
              )}
            </div>

            <div className="tnum mt-2.5 font-mono text-[30px] leading-none text-ink">
              {formatMoney(BigInt(balances[kind]), { currency: "KSh" })}
            </div>

            <p className="mt-3 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-muted">
              {kind === "DEMO"
                ? "Practice funds. Identical engine and identical payouts to Live — it is here to teach the product, not to let you win until you deposit."
                : "Real funds. Deposits and withdrawals settle to the M-Pesa number your account is registered with."}
            </p>

            {kind === "LIVE" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => cash.open("deposit")}
                  className="flex h-10 items-center gap-1.5 bg-cash px-4 text-[13px] font-semibold text-white transition-colors hover:bg-cash-hover"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
                  Deposit
                </button>
                <button
                  onClick={() => cash.open("withdraw")}
                  className="flex h-10 items-center gap-1.5 border border-line-strong bg-surface-3 px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-4"
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
                  Withdraw
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {cash.element}
    </>
  );
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export function PerformanceView() {
  return <StatsPanel />;
}

// ---------------------------------------------------------------------------
// Selected market
// ---------------------------------------------------------------------------

export function MarketView() {
  const symbol = useStore((s) => s.symbol);
  const spec = instrument(symbol);
  const breakEven = (1 / (1 + spec.payoutBps / 10_000)) * 100;

  return (
    <div>
      <dl className="divide-y divide-line border-b border-line">
        <DetailRow label="Instrument" value={spec.displayName} />
        <DetailRow label="Symbol" value={spec.symbol} mono />
        <DetailRow label="Class" value={KIND_LABEL[spec.kind]} />
        <DetailRow label="Quoted decimals" value={String(spec.precision)} mono />
        <DetailRow label="Payout" value={`${spec.payoutBps / 100}%`} mono tone="up" />
        <DetailRow
          label="Break-even win rate"
          value={`${breakEven.toFixed(1)}%`}
          mono
          tone="warning"
        />
        <DetailRow
          label="Price feed"
          value={spec.simulated ? "Simulated" : "Synthetic index"}
        />
      </dl>

      <div className="space-y-3 p-5">
        <p className="max-w-[60ch] text-[12.5px] leading-relaxed text-ink-secondary">
          {spec.simulated
            ? `${spec.symbol} names a real market, but the price shown here is generated by the simulation engine — it is not a live quote. It switches to real data the moment a market-data provider is connected.`
            : `${spec.displayName} has no underlying market. Its price is defined by a published random process, so a generated feed is the complete implementation of it rather than a stand-in for something real.`}
        </p>
        <p className="max-w-[60ch] text-[12.5px] leading-relaxed text-ink-secondary">
          At a {spec.payoutBps / 100}% payout you need to be right{" "}
          <span className="tnum font-mono text-warning">
            {breakEven.toFixed(1)}%
          </span>{" "}
          of the time simply to break even. Below that, a run of contracts loses
          money however the individual results feel.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export function WalletView() {
  const cashEvents = useStore((s) => s.cashEvents);
  const liveBalance = useStore((s) => BigInt(s.balances.LIVE));
  const cash = useCashDialog();

  return (
    <>
      <div className="border-b border-line p-5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Live balance
        </div>
        <div className="tnum mt-1.5 font-mono text-[30px] leading-none text-ink">
          {formatMoney(liveBalance, { currency: "KSh" })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => cash.open("deposit")}
            className="flex h-10 items-center gap-1.5 bg-cash px-4 text-[13px] font-semibold text-white transition-colors hover:bg-cash-hover"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
            Deposit
          </button>
          <button
            onClick={() => cash.open("withdraw")}
            className="flex h-10 items-center gap-1.5 border border-line-strong bg-surface-3 px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-4"
          >
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
            Withdraw
          </button>
        </div>
      </div>

      <h2 className="px-5 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
        Recent movements
      </h2>

      {cashEvents.length === 0 ? (
        <Empty
          icon={<Wallet className="h-5 w-5" />}
          title="No deposits or withdrawals yet"
          hint="Money in and out of your Live account is listed here with its M-Pesa reference."
        />
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {cashEvents.slice(0, 50).map((event) => (
            <CashRow key={event.id} event={event} />
          ))}
        </div>
      )}
      {cash.element}
    </>
  );
}

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------

/**
 * Cash movements and settled contracts merged into one time-ordered ledger.
 * "Where did my money go" is not answerable from two separate lists.
 */
export function StatementView() {
  const cashEvents = useStore((s) => s.cashEvents);
  const trades = useStore((s) => s.trades);

  const rows = [
    ...cashEvents.map((e) => ({
      id: e.id,
      at: e.createdAt,
      label: e.kind === "DEPOSIT" ? "Deposit" : "Withdrawal",
      detail: e.reference ?? "pending",
      deltaMinor:
        e.kind === "DEPOSIT" ? BigInt(e.amountMinor) : -BigInt(e.amountMinor),
    })),
    ...trades
      .filter((t) => t.status !== "OPEN")
      .map((t) => ({
        id: t.id,
        at: t.settledAt ?? t.openedAt,
        label: `${t.direction === "UP" ? "▲" : "▼"} ${t.symbol}`,
        detail:
          t.status === "WON"
            ? "Contract won"
            : t.status === "LOST"
              ? "Contract lost"
              : "Stake refunded",
        deltaMinor: BigInt(t.pnlMinor ?? "0"),
      })),
  ].sort((a, b) => b.at - a.at);

  if (rows.length === 0) {
    return (
      <Empty
        icon={<History className="h-5 w-5" />}
        title="No transactions yet"
        hint="Deposits, withdrawals and settled contracts appear here as a single ledger."
      />
    );
  }

  return (
    <div className="divide-y divide-line">
      {rows.slice(0, 200).map((row) => (
        <div key={row.id} className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-ink">{row.label}</div>
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
  );
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function VerificationView() {
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
    <div>
      <div className="flex items-center gap-3 border-b border-line p-5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-up" aria-hidden />
        <div>
          <div className="text-[14px] font-medium text-ink">Tier 1 verified</div>
          <div className="text-[12px] text-ink-muted">
            Your M-Pesa number is confirmed
          </div>
        </div>
      </div>

      <div className="divide-y divide-line">
        {tiers.map((tier) => (
          <div key={tier.name} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-medium text-ink">
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
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
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
                onClick={() => toast("Verification is not wired up in this build")}
                className="mt-4 h-10 w-full border border-line-strong bg-surface-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-4 sm:w-auto sm:px-4"
              >
                Start {tier.name} verification
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Real preferences bound to the store — not a page of dead switches. */
export function SettingsView() {
  const stakeMinor = useStore((s) => BigInt(s.stakeMinor));
  const setStakeMinor = useStore((s) => s.setStakeMinor);
  const durationSec = useStore((s) => s.durationSec);
  const setDuration = useStore((s) => s.setDuration);
  const chartStyle = useStore((s) => s.chartStyle);
  const setChartStyle = useStore((s) => s.setChartStyle);
  const resetDemo = useStore((s) => s.resetDemo);

  return (
    <div className="divide-y divide-line">
      <Field
        label="Default stake"
        hint="Prefilled on the ticket each time the terminal opens."
      >
        <div className="flex max-w-[240px] items-center gap-2 border border-line bg-surface-2 px-3">
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

      <Field label="Default expiry" hint="The contract length selected by default.">
        <Segmented
          options={DURATIONS.map((d) => ({ value: d.seconds, label: d.label }))}
          value={durationSec}
          onChange={setDuration}
        />
      </Field>

      <Field label="Chart style" hint="Candles show open, high, low and close.">
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
          className="h-10 border border-line-strong bg-surface-3 px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-4"
        >
          Reset demo balance
        </button>
      </Field>

      <div className="p-5">
        <p className="max-w-[60ch] text-[12.5px] leading-relaxed text-ink-muted">
          Preferences are stored in this browser only. Signing out clears them
          along with your balances and contract history.
        </p>
      </div>
    </div>
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
    <div className="p-5">
      <div className="text-[13px] font-medium text-ink">{label}</div>
      {hint ? (
        <p className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function HelpView() {
  const faqs = [
    {
      q: "How is a contract decided?",
      a: "At expiry the price at that exact instant is compared with your entry price. Higher wins if it closed above, Lower if it closed below. Both prices are recorded on the contract, so any result can be checked afterwards rather than taken on trust.",
    },
    {
      q: "What happens if it closes exactly at my entry price?",
      a: "The contract ties and your stake is returned in full. It is not scored as a loss.",
    },
    {
      q: "What is the break-even win rate?",
      a: "Because a win pays back less than 100% of your stake as profit, being right half the time loses money over any meaningful number of contracts. At an 85% payout you need to be right 54.1% of the time simply to stay level. Each instrument's exact figure is on its market page.",
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
    <div>
      <div className="divide-y divide-line border-b border-line">
        {faqs.map((faq) => (
          <details key={faq.q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none text-[13.5px] font-medium text-ink marker:hidden">
              <span className="flex items-start gap-2">
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-90"
                  aria-hidden
                />
                {faq.q}
              </span>
            </summary>
            <p className="mt-2.5 max-w-[60ch] pl-6 text-[12.5px] leading-relaxed text-ink-secondary">
              {faq.a}
            </p>
          </details>
        ))}
      </div>

      <div className="p-5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
          Contact
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => toast("Live chat is not wired up in this build")}
            className="flex items-center gap-2.5 border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-surface-3"
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
            onClick={() => toast("Email support is not wired up in this build")}
            className="flex items-center gap-2.5 border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-surface-3"
          >
            <Mail className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="text-[13px] text-ink-secondary">
              support@meridian.test
            </span>
          </button>
        </div>
      </div>
    </div>
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
    <div className="flex items-baseline justify-between gap-3 px-5 py-3">
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
