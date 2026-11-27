"use client";

import { Download, Inbox, RotateCcw, Search } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/auth";
import type { AdminDeposit } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { AdminSelect } from "./AdminSelect";
import { Badge, Button, Card, Skeleton, StatTile } from "./ui";
import {
  DEFAULT_DEPOSIT_FILTERS,
  periodRange,
  type DepositDemoFilter,
  type DepositPeriod,
  type DepositStatusFilter,
  type DepositsState,
} from "./useDeposits";

/**
 * Every deposit, with filters. A record to look things up in — it has no
 * controls that change a deposit. Crediting is PayHero's callback's job alone.
 */

const STATUS_OPTIONS: ReadonlyArray<{ value: DepositStatusFilter; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

const PERIOD_OPTIONS: ReadonlyArray<{ value: DepositPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

const DEMO_OPTIONS: ReadonlyArray<{ value: DepositDemoFilter; label: string }> = [
  { value: "real", label: "Real money" },
  { value: "demo", label: "Demo only" },
  { value: "all", label: "Real + demo" },
];

const ksh = (minor: string) => formatMoney(minor, { currency: "KSh" });

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function DepositsView({ state }: { state: DepositsState }) {
  const { deposits, totals, truncated, error, filters, setFilters, resetFilters } = state;
  const { from, to } = periodRange(filters);
  const filtered =
    JSON.stringify(filters) !== JSON.stringify(DEFAULT_DEPOSIT_FILTERS);

  return (
    <div className="space-y-5">
      {/* --- Totals over what the filter matched ---------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Collected"
          value={totals ? ksh(totals.completedMinor) : <Skeleton className="h-7 w-28" />}
          hint={totals ? `${totals.completedCount.toLocaleString()} completed` : null}
        />
        <StatTile
          label="Bonus credited"
          value={totals ? ksh(totals.bonusMinor) : <Skeleton className="h-7 w-24" />}
          hint="On completed deposits"
        />
        <StatTile
          label="Pending"
          value={totals ? ksh(totals.pendingMinor) : <Skeleton className="h-7 w-24" />}
          hint={totals ? `${totals.pendingCount.toLocaleString()} awaiting M-Pesa` : null}
        />
        <StatTile
          label="Failed"
          value={totals ? totals.failedCount.toLocaleString() : <Skeleton className="h-7 w-12" />}
          hint="Cancelled, timed out or declined"
        />
      </div>

      <Card className="overflow-hidden">
        {/* --- Filters ------------------------------------------------------ */}
        <div className="flex flex-wrap items-end gap-2 border-b border-adm-line px-4 py-3 sm:px-5">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search</span>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-adm-ink-4"
            />
            <input
              value={filters.q}
              onChange={(event) => setFilters({ q: event.target.value })}
              placeholder="Phone, M-Pesa reference or username"
              className={cn(
                "h-9 w-full rounded-none border border-adm-line-strong bg-adm-surface pl-8 pr-3",
                "text-[13px] text-adm-ink outline-none placeholder:text-adm-ink-4",
                "focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
              )}
            />
          </label>

          <AdminSelect
            label="Status"
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(status) => setFilters({ status })}
          />
          <AdminSelect
            label="Period"
            value={filters.period}
            options={PERIOD_OPTIONS}
            onChange={(period) =>
              setFilters(
                period === "custom" && !filters.from
                  ? { period, ...periodRange({ ...filters, period: "30d" }) }
                  : { period },
              )
            }
          />
          <AdminSelect
            label="Money"
            value={filters.demo}
            options={DEMO_OPTIONS}
            onChange={(demo) => setFilters({ demo })}
          />

          {filters.period === "custom" ? (
            <div className="flex items-center gap-1.5">
              <DateInput
                label="From"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(value) => setFilters({ from: value })}
              />
              <span className="text-[12px] text-adm-ink-4">to</span>
              <DateInput
                label="To"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(value) => setFilters({ to: value })}
              />
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {filtered ? (
              <Button onClick={resetFilters} title="Back to the default filters">
                <RotateCcw size={13} />
                Reset
              </Button>
            ) : null}
            <Button
              disabled={!deposits || deposits.length === 0}
              onClick={() => deposits && downloadCsv(deposits, from, to)}
              title="Download the rows below as CSV"
            >
              <Download size={13} />
              Export
            </Button>
          </div>
        </div>

        {truncated ? (
          <p className="border-b border-adm-line bg-adm-subtle px-5 py-2 text-[12px] text-adm-ink-3">
            Showing the newest {deposits?.length.toLocaleString()} matches — narrow the
            period or search to see older ones. Totals cover the rows shown.
          </p>
        ) : null}

        {/* --- Table -------------------------------------------------------- */}
        {error ? (
          <div className="px-6 py-10 text-center text-[13px] text-adm-neg">{error}</div>
        ) : deposits === null ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : deposits.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Inbox size={20} className="text-adm-ink-4" />
            <p className="text-[13.5px] font-medium text-adm-ink">No deposits match</p>
            <p className="text-[12.5px] text-adm-ink-3">
              Try a longer period or clear the search.
            </p>
          </div>
        ) : (
          <div className={cn("overflow-x-auto", state.loading && "opacity-60")}>
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-adm-line bg-adm-raise">
                  <Th className="text-left">Date</Th>
                  <Th className="text-left">Customer</Th>
                  <Th>Amount</Th>
                  <Th>Bonus</Th>
                  <Th className="text-left">Status</Th>
                  <Th className="text-left">Reference</Th>
                  <Th className="text-left">Settled</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-line">
                {deposits.map((row) => (
                  <DepositRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DepositRow({ row }: { row: AdminDeposit }) {
  const hasBonus = row.bonusMinor !== "0";
  return (
    <tr className="transition-colors hover:bg-adm-raise">
      <Td className="whitespace-nowrap text-left text-adm-ink-3">{when(row.createdAt)}</Td>
      <Td className="text-left">
        <div className="font-medium text-adm-ink">
          {row.username !== "—" ? row.username : "Unnamed account"}
        </div>
        <div className="font-mono text-[11.5px] text-adm-ink-3">{formatPhone(row.phone)}</div>
      </Td>
      <Td className="whitespace-nowrap font-medium text-adm-ink">{ksh(row.amountMinor)}</Td>
      <Td className="whitespace-nowrap">{hasBonus ? ksh(row.bonusMinor) : "—"}</Td>
      <Td className="text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={row.status} />
          {row.isDemo ? <Badge>Demo</Badge> : null}
        </div>
        {row.status === "FAILED" && row.failureReason ? (
          <div
            className="mt-1 max-w-[220px] truncate text-[11.5px] text-adm-ink-3"
            title={row.failureReason}
          >
            {row.failureReason}
          </div>
        ) : null}
      </Td>
      <Td className="text-left font-mono text-[12px] text-adm-ink-2">{row.reference ?? "—"}</Td>
      <Td className="whitespace-nowrap text-left text-adm-ink-3">{when(row.settledAt)}</Td>
    </tr>
  );
}

function StatusBadge({ status }: { status: AdminDeposit["status"] }) {
  if (status === "COMPLETED") return <Badge tone="positive">Completed</Badge>;
  if (status === "PENDING") return <Badge tone="accent">Pending</Badge>;
  return (
    <Badge className="border-[#f3c9c6] bg-[#fdeceb] text-adm-neg">Failed</Badge>
  );
}

function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 rounded-none border border-adm-line-strong bg-adm-surface px-2.5",
          "text-[13px] text-adm-ink outline-none",
          "focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
        )}
      />
    </label>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-adm-ink-3",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("px-4 py-3 text-right align-top tabular-nums text-adm-ink-2", className)}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// CSV export of the rows on screen
// ---------------------------------------------------------------------------

function minorToKsh(minor: string): string {
  const value = BigInt(minor);
  const whole = value / 100n;
  const cents = (value % 100n).toString().padStart(2, "0");
  return `${whole}.${cents}`;
}

function csvCell(value: string): string {
  // Leading = + - @ would be read as a formula by a spreadsheet.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadCsv(rows: AdminDeposit[], from: string, to: string) {
  const header = [
    "created_at",
    "username",
    "phone",
    "amount_ksh",
    "bonus_ksh",
    "status",
    "reference",
    "failure_reason",
    "demo",
    "site",
    "settled_at",
  ];
  const lines = rows.map((row) =>
    [
      row.createdAt,
      row.username,
      row.phone,
      minorToKsh(row.amountMinor),
      minorToKsh(row.bonusMinor),
      row.status,
      row.reference ?? "",
      row.failureReason ?? "",
      row.isDemo ? "yes" : "no",
      row.site ?? "",
      row.settledAt ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `deposits${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
