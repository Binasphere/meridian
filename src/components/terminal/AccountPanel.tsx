"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  History,
  LineChart,
  LogOut,
  Mail,
  MessageSquare,
  RotateCcw,
  Settings,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelative } from "@/lib/format";
import { formatPhone, useAuth, useCurrentAccount } from "@/lib/auth";
import { DURATIONS, instrument, KIND_LABEL } from "@/lib/market/instruments";
import { useHistory, useStore } from "@/lib/store";
import { Empty, Segmented } from "@/components/ui/primitives";
import { StatsPanel } from "./StatsPanel";
import { CashDialog, CashRow } from "./CashDialog";

type View =
  | "root"
  | "balances"
  | "performance"
  | "market"
  | "wallet"
  | "statement"
  | "verification"
  | "settings"
  | "help";

const TITLES: Record<Exclude<View, "root">, string> = {
  balances: "Balances",
  performance: "Session performance",
  market: "Selected market",
  wallet: "Deposits & withdrawals",
  statement: "Transaction statement",
  verification: "Verification & limits",
  settings: "Settings",
  help: "Help & support",
};

/**
 * The account panel.
 *
 * A single-level drill-down rather than one long scroll. The root is a list of
 * destinations that fits on screen without scrolling — you can see everything
 * the account can do at a glance — and each one opens its own view in place.
 *
 * Everything here is *true but not urgent*. While a contract is counting down
 * the only things that should compete for attention are the price, the
 * countdown, and the two buttons.
 */
export function AccountPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<View>("root");
  const [cash, setCash] = useState<"deposit" | "withdraw" | null>(null);

  const signOutAuth = useAuth((s) => s.signOut);
  const clearSession = useStore((s) => s.signOut);

  // Always reopen at the root; landing back inside a sub-view you visited an
  // hour ago is disorienting.
  useEffect(() => {
    if (open) setView("root");
  }, [open]);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            className={cn(
              "panel-slide fixed inset-y-0 right-0 z-50 flex w-full max-w-[392px] flex-col",
              "border-l border-line bg-surface-1 shadow-2xl focus:outline-none",
            )}
          >
            {/* --- Header --------------------------------------------------- */}
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
              {view !== "root" ? (
                <button
                  onClick={() => setView("root")}
                  aria-label="Back"
                  className="grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}

              <Dialog.Title className="text-[13px] font-medium text-ink">
                {view === "root" ? "Account" : TITLES[view]}
              </Dialog.Title>

              <Dialog.Close
                aria-label="Close"
                className="ml-auto grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === "root" ? (
                <RootView onNavigate={setView} onCash={setCash} />
              ) : view === "balances" ? (
                <BalancesView onCash={setCash} />
              ) : view === "performance" ? (
                <StatsPanel />
              ) : view === "market" ? (
                <MarketView />
              ) : view === "wallet" ? (
                <WalletView onCash={setCash} />
              ) : view === "statement" ? (
                <StatementView />
              ) : view === "verification" ? (
                <VerificationView />
              ) : view === "settings" ? (
                <SettingsView />
              ) : (
                <HelpView />
              )}
            </div>

            {/* --- Log out --------------------------------------------------- */}
            {view === "root" ? (
              <div className="shrink-0 border-t border-line p-3">
                <button
                  onClick={() => {
                    clearSession();
                    signOutAuth();
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex h-11 w-full items-center justify-center gap-2 border border-down/30 bg-down/10",
                    "text-[13.5px] font-semibold text-down transition-colors hover:bg-down/20",
                  )}
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Log out
                </button>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {cash ? (
        <CashDialog
          mode={cash}
          open={cash !== null}
          onOpenChange={(next) => !next && setCash(null)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function RootView({
  onNavigate,
  onCash,
}: {
  onNavigate: (view: View) => void;
  onCash: (mode: "deposit" | "withdraw") => void;
}) {
  const account = useCurrentAccount();
  const balances = useStore((s) => s.balances);
  const accountKind = useStore((s) => s.accountKind);
  const resetDemo = useStore((s) => s.resetDemo);
  const symbol = useStore((s) => s.symbol);
  const history = useHistory();
  const spec = instrument(symbol);

  return (
    <div>
      {/* --- Identity -------------------------------------------------------- */}
      <div className="flex items-center gap-3 border-b border-line p-3.5">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center border border-line bg-surface-3 text-[13px] font-semibold text-ink"
          aria-hidden
        >
          {account ? account.phone.slice(-2) : "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="tnum truncate font-mono text-[13.5px] text-ink">
            {account ? formatPhone(account.phone) : "Not signed in"}
          </div>
          <div className="text-[11px] text-ink-muted">
            {account
              ? `Since ${new Date(account.createdAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
              : "—"}
          </div>
        </div>
      </div>

      {/* --- Money actions, given prominence -------------------------------- */}
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
        <button
          onClick={() => onCash("deposit")}
          className="flex items-center justify-center gap-1.5 bg-cash py-3 text-[13px] font-semibold text-white transition-colors hover:bg-cash-hover"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
          Deposit
        </button>
        <button
          onClick={() => onCash("withdraw")}
          className="flex items-center justify-center gap-1.5 bg-surface-2 py-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-3"
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
          Withdraw
        </button>
      </div>

      {/* --- Destinations ---------------------------------------------------- */}
      <nav className="divide-y divide-line">
        <LinkRow
          icon={Wallet}
          label="Balances"
          value={formatMoney(BigInt(balances[accountKind]), { currency: "KSh" })}
          onClick={() => onNavigate("balances")}
        />
        <LinkRow
          icon={ChartNoAxesColumn}
          label="Session performance"
          value={history.length > 0 ? `${history.length} settled` : "None yet"}
          onClick={() => onNavigate("performance")}
        />
        <LinkRow
          icon={LineChart}
          label="Selected market"
          value={spec.symbol}
          onClick={() => onNavigate("market")}
        />
        <LinkRow
          icon={ArrowDownToLine}
          label="Deposits & withdrawals"
          onClick={() => onNavigate("wallet")}
        />
        <LinkRow
          icon={History}
          label="Transaction statement"
          onClick={() => onNavigate("statement")}
        />
        <LinkRow
          icon={BadgeCheck}
          label="Verification & limits"
          value="Tier 1"
          onClick={() => onNavigate("verification")}
        />
        <LinkRow
          icon={Settings}
          label="Settings"
          onClick={() => onNavigate("settings")}
        />
        <LinkRow
          icon={CircleHelp}
          label="Help & support"
          onClick={() => onNavigate("help")}
        />
        <LinkRow
          icon={RotateCcw}
          label="Reset demo balance"
          onClick={() => {
            resetDemo();
            toast.success("Demo balance reset to KSh 100,000.00");
          }}
          chevron={false}
        />
      </nav>
    </div>
  );
}

function LinkRow({
  icon: Icon,
  label,
  value,
  onClick,
  chevron = true,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
  onClick: () => void;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      <Icon className="h-[15px] w-[15px] shrink-0 text-ink-muted" aria-hidden />
      <span className="flex-1 truncate text-[13px] text-ink-secondary">
        {label}
      </span>
      {value ? (
        <span className="tnum shrink-0 font-mono text-[11px] text-ink-faint">
          {value}
        </span>
      ) : null}
      {chevron ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function BalancesView({
  onCash,
}: {
  onCash: (mode: "deposit" | "withdraw") => void;
}) {
  const balances = useStore((s) => s.balances);
  const accountKind = useStore((s) => s.accountKind);
  const setAccountKind = useStore((s) => s.setAccountKind);

  return (
    <div>
      {(["DEMO", "LIVE"] as const).map((kind) => (
        <div key={kind} className="border-b border-line p-4">
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
                className="ml-auto text-[10.5px] text-accent hover:underline"
              >
                switch to this
              </button>
            )}
          </div>

          <div className="tnum mt-2 font-mono text-[24px] leading-none text-ink">
            {formatMoney(BigInt(balances[kind]), { currency: "KSh" })}
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
            {kind === "DEMO"
              ? "Practice funds. Identical engine and payouts to Live — it is here to teach the product, not to let you win until you deposit."
              : "Real funds. Deposits and withdrawals settle to your M-Pesa number."}
          </p>

          {kind === "LIVE" ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onCash("deposit")}
                className="h-9 bg-cash text-[12.5px] font-semibold text-white transition-colors hover:bg-cash-hover"
              >
                Deposit
              </button>
              <button
                onClick={() => onCash("withdraw")}
                className="h-9 border border-line-strong bg-surface-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-4"
              >
                Withdraw
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MarketView() {
  const symbol = useStore((s) => s.symbol);
  const spec = instrument(symbol);
  const breakEven = (1 / (1 + spec.payoutBps / 10_000)) * 100;

  return (
    <div>
      <dl className="divide-y divide-line border-b border-line">
        <DetailRow label="Instrument" value={spec.displayName} />
        <DetailRow label="Symbol" value={spec.symbol} mono />
        <DetailRow label="Class" value={KIND_LABEL[spec.kind]} />
        <DetailRow label="Decimals" value={String(spec.precision)} mono />
        <DetailRow
          label="Payout"
          value={`${spec.payoutBps / 100}%`}
          mono
          tone="up"
        />
        <DetailRow
          label="Break-even"
          value={`${breakEven.toFixed(1)}%`}
          mono
          tone="warning"
        />
        <DetailRow
          label="Price feed"
          value={spec.simulated ? "Simulated" : "Synthetic index"}
        />
      </dl>

      <div className="p-4">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          {spec.simulated
            ? `${spec.symbol} names a real market, but the price shown here is generated by the simulation engine — it is not a live quote. It switches to real data when a market-data provider is connected.`
            : `${spec.displayName} has no underlying market. Its price is defined by a published random process, so a generated feed is the complete implementation of it rather than a stand-in.`}
        </p>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">
          At a {spec.payoutBps / 100}% payout you need to be right{" "}
          <span className="tnum font-mono text-warning">
            {breakEven.toFixed(1)}%
          </span>{" "}
          of the time simply to break even. Below that, a run loses money however
          the individual contracts feel.
        </p>
      </div>
    </div>
  );
}

function WalletView({
  onCash,
}: {
  onCash: (mode: "deposit" | "withdraw") => void;
}) {
  const cashEvents = useStore((s) => s.cashEvents);
  const liveBalance = useStore((s) => BigInt(s.balances.LIVE));

  return (
    <div>
      <div className="border-b border-line p-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Live balance
        </div>
        <div className="tnum mt-1.5 font-mono text-[26px] leading-none text-ink">
          {formatMoney(liveBalance, { currency: "KSh" })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => onCash("deposit")}
            className="flex h-10 items-center justify-center gap-1.5 bg-cash text-[13px] font-semibold text-white transition-colors hover:bg-cash-hover"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
            Deposit
          </button>
          <button
            onClick={() => onCash("withdraw")}
            className="flex h-10 items-center justify-center gap-1.5 border border-line-strong bg-surface-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-4"
          >
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
            Withdraw
          </button>
        </div>
      </div>

      <h3 className="px-4 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
        Recent movements
      </h3>

      {cashEvents.length === 0 ? (
        <Empty
          icon={<Wallet className="h-5 w-5" />}
          title="No deposits or withdrawals yet"
          hint="Money in and out of your Live account is listed here with its M-Pesa reference."
        />
      ) : (
        <div className="divide-y divide-line">
          {cashEvents.slice(0, 25).map((event) => (
            <CashRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The statement.
 *
 * Cash movements and settled contracts merged into one time-ordered ledger,
 * because that is how a customer reconciles a balance — "where did the money
 * go" is not answerable from two separate lists.
 */
function StatementView() {
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
      pending: e.status === "PENDING",
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
        pending: false,
      })),
  ].sort((a, b) => b.at - a.at);

  if (rows.length === 0) {
    return (
      <Empty
        icon={<History className="h-5 w-5" />}
        title="No transactions yet"
        hint="Deposits, withdrawals and settled contracts appear here as one ledger."
      />
    );
  }

  return (
    <div className="divide-y divide-line">
      {rows.slice(0, 60).map((row) => (
        <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] text-ink">{row.label}</div>
            <div className="truncate font-mono text-[10.5px] text-ink-faint">
              {row.detail} · {formatRelative(row.at)}
            </div>
          </div>
          <div
            className={cn(
              "tnum shrink-0 font-mono text-[12.5px]",
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

function VerificationView() {
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
      requirement: "ID, proof of address, source of funds",
      daily: "KSh 1,000,000",
      perTx: "KSh 500,000",
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2.5 border-b border-line p-4">
        <ShieldCheck className="h-4 w-4 shrink-0 text-up" aria-hidden />
        <div>
          <div className="text-[13px] font-medium text-ink">Tier 1 verified</div>
          <div className="text-[11.5px] text-ink-muted">
            Your M-Pesa number is confirmed
          </div>
        </div>
      </div>

      {tiers.map((tier) => (
        <div key={tier.name} className="border-b border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-ink">
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
          <p className="mt-1.5 text-[11.5px] text-ink-muted">
            {tier.requirement}
          </p>
          <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line pt-2.5">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-ink-faint">
                Daily limit
              </dt>
              <dd className="tnum font-mono text-[12px] text-ink-secondary">
                {tier.daily}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-ink-faint">
                Per transaction
              </dt>
              <dd className="tnum font-mono text-[12px] text-ink-secondary">
                {tier.perTx}
              </dd>
            </div>
          </dl>
          {tier.status === "available" ? (
            <button
              onClick={() => toast("Verification is not wired up in this build")}
              className="mt-3 h-9 w-full border border-line-strong bg-surface-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-4"
            >
              Start {tier.name} verification
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Real preferences bound to the store — not a page of dead switches. */
function SettingsView() {
  const stakeMinor = useStore((s) => BigInt(s.stakeMinor));
  const setStakeMinor = useStore((s) => s.setStakeMinor);
  const durationSec = useStore((s) => s.durationSec);
  const setDuration = useStore((s) => s.setDuration);
  const chartStyle = useStore((s) => s.chartStyle);
  const setChartStyle = useStore((s) => s.setChartStyle);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Default stake
        </div>
        <div className="flex items-center gap-2 border border-line bg-surface-1 px-3">
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
      </div>

      <div>
        <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Default expiry
        </div>
        <Segmented
          className="w-full [&>button]:flex-1"
          options={DURATIONS.map((d) => ({ value: d.seconds, label: d.label }))}
          value={durationSec}
          onChange={setDuration}
        />
      </div>

      <div>
        <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Chart style
        </div>
        <Segmented
          className="w-full [&>button]:flex-1"
          options={[
            { value: "candles" as const, label: "Candles" },
            { value: "area" as const, label: "Area" },
          ]}
          value={chartStyle}
          onChange={setChartStyle}
        />
      </div>

      <div className="border-t border-line pt-4">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          Preferences are stored in this browser only. Signing out clears them
          along with your balances and contract history.
        </p>
      </div>
    </div>
  );
}

function HelpView() {
  const faqs = [
    {
      q: "How is a contract decided?",
      a: "At expiry the price at that exact instant is compared with your entry price. Higher wins if it closed above, Lower if it closed below. The settlement price is recorded on the contract so any result can be checked afterwards.",
    },
    {
      q: "What happens if it closes exactly at my entry?",
      a: "The contract ties and your stake is returned in full. It is not scored as a loss.",
    },
    {
      q: "What is the break-even win rate?",
      a: "Because a win pays less than 100% of your stake, being right half the time loses money over any meaningful number of contracts. At an 85% payout you need to be right 54.1% of the time just to stay level. Each instrument's figure is on its market page.",
    },
    {
      q: "How long do deposits take?",
      a: "An M-Pesa STK push arrives on your handset within a few seconds. Once you enter your PIN the balance updates immediately. Withdrawals are sent to the same number your account is registered with.",
    },
    {
      q: "Can I change my payout number?",
      a: "Not from the payment form. Your M-Pesa number is your account identity, and changing it is a verified account action — this is what stops funds being redirected if someone gets into your session.",
    },
  ];

  return (
    <div>
      <div className="divide-y divide-line border-b border-line">
        {faqs.map((faq) => (
          <details key={faq.q} className="group px-4 py-3">
            <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink marker:hidden">
              <span className="flex items-start gap-2">
                <ChevronRight
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform group-open:rotate-90"
                  aria-hidden
                />
                {faq.q}
              </span>
            </summary>
            <p className="mt-2 pl-5 text-[11.5px] leading-relaxed text-ink-muted">
              {faq.a}
            </p>
          </details>
        ))}
      </div>

      <div className="p-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
          Contact
        </h3>
        <div className="mt-2.5 flex flex-col gap-2">
          <button
            onClick={() => toast("Live chat is not wired up in this build")}
            className="flex items-center gap-2.5 border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
          >
            <MessageSquare
              className="h-[15px] w-[15px] shrink-0 text-ink-muted"
              aria-hidden
            />
            <span className="text-[12.5px] text-ink-secondary">
              Live chat · 24/7
            </span>
          </button>
          <button
            onClick={() => toast("Email support is not wired up in this build")}
            className="flex items-center gap-2.5 border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
          >
            <Mail
              className="h-[15px] w-[15px] shrink-0 text-ink-muted"
              aria-hidden
            />
            <span className="text-[12.5px] text-ink-secondary">
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
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "text-right text-[12.5px]",
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
