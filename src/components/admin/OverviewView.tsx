"use client";

import { useMemo } from "react";
import { Radio } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SiteTotals } from "@/lib/admin/types";
import { Badge, Card, CardHeader, Skeleton, StatTile } from "./ui";
import { BarRows, LineChart, TableView, seriesColor, type LineSeries } from "./charts";
import { OVERVIEW_RANGES, type OverviewState } from "./useOverview";

/**
 * Overview — the platform, and how the two products compare.
 *
 * Every money figure on this page is **real money only**: deposits that
 * actually settled through PayHero. The M-Pesa clone rail runs its deposits
 * through the same `deposit_start` / `deposit_settle` pair as a live push, so
 * until `cash_events.is_demo` existed those prop amounts were counted as
 * revenue — which is why this console used to report far more collected than
 * the PayHero dashboard ever showed. That is stated on the page, not just in a
 * commit: a figure that quietly changed definition is a figure nobody trusts.
 *
 * Nothing is invented to fill space. No revenue projection, no fabricated
 * trend, no sparkline over data that does not exist. A dashboard that decorates
 * itself with numbers it cannot substantiate teaches you to distrust the ones
 * it can.
 */
export function OverviewView({ state }: { state: OverviewState }) {
  const { sites, daily, days, setDays, loading, error } = state;

  const totals = useMemo(() => {
    if (!sites) return null;

    return sites.reduce(
      (sum, site) => ({
        collected: sum.collected + BigInt(site.depositMinor ?? "0"),
        withdrawn: sum.withdrawn + BigInt(site.withdrawalMinor ?? "0"),
        pending: sum.pending + BigInt(site.pendingMinor ?? "0"),
        held: sum.held + BigInt(site.liveBalanceMinor ?? "0"),
        users: sum.users + site.users,
        deposits: sum.deposits + site.depositCount,
      }),
      {
        collected: 0n,
        withdrawn: 0n,
        pending: 0n,
        held: 0n,
        users: 0,
        deposits: 0,
      },
    );
  }, [sites]);

  /** The daily series pivoted into one line per domain. */
  const chart = useMemo(() => {
    if (!daily || !sites) return null;

    const dayList = [...new Set(daily.map((point) => point.day))].sort();

    const money: LineSeries[] = sites.map((site) => ({
      id: site.id,
      label: site.name,
      values: dayList.map((day) => {
        const point = daily.find((row) => row.day === day && row.site === site.id);
        // Shillings, not cents: an axis in cents is an axis of six-digit
        // numbers nobody reads.
        return Number(BigInt(point?.depositMinor ?? "0") / 100n);
      }),
    }));

    const signups: LineSeries[] = sites.map((site) => ({
      id: site.id,
      label: site.name,
      values: dayList.map(
        (day) =>
          daily.find((row) => row.day === day && row.site === site.id)?.signups ?? 0,
      ),
    }));

    return { dayList, money, signups };
  }, [daily, sites]);

  return (
    // Held at reduced opacity while refetching rather than replaced by a
    // skeleton: changing the range must not make the page flash empty.
    <div className={cn("space-y-5", loading && sites && "opacity-60 transition-opacity")}>
      {error ? (
        <Card className="p-4">
          <p className="text-[13px] text-adm-neg">{error}</p>
        </Card>
      ) : null}

      {/* --- The filter row. One row, above everything it scopes. -------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-adm-ink-3">
          Money settled through PayHero.{" "}
          <span className="text-adm-ink-2">Demo-handset deposits are excluded</span>{" "}
          — they settle against a prop wallet, not your till.
        </p>

        <div
          role="group"
          aria-label="Time range"
          className="flex border border-adm-line-strong"
        >
          {OVERVIEW_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setDays(range)}
              aria-pressed={days === range}
              className={cn(
                "px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                days === range
                  ? "bg-adm-accent-tint text-adm-accent-deep"
                  : "bg-adm-surface text-adm-ink-3 hover:bg-adm-subtle hover:text-adm-ink",
              )}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {/* --- The headline figures ---------------------------------------- */}
      {totals ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Collected"
            value={formatMoney(totals.collected, { currency: "KSh", compact: true })}
            hint={`${totals.deposits.toLocaleString()} real deposits, all time`}
          />
          <StatTile
            label="Paid out"
            value={formatMoney(totals.withdrawn, { currency: "KSh", compact: true })}
            hint="Withdrawals marked paid"
          />
          <StatTile
            label="Held for customers"
            value={formatMoney(totals.held, { currency: "KSh", compact: true })}
            hint="Live balances across every account"
          />
          <StatTile
            label="Customers"
            value={totals.users.toLocaleString()}
            hint={
              totals.pending > 0n
                ? `${formatMoney(totals.pending, { currency: "KSh", compact: true })} in deposits still pending`
                : "No deposits awaiting M-Pesa"
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} className="space-y-3 p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-28" />
            </Card>
          ))}
        </div>
      )}

      {/* --- Collected over time, by domain ------------------------------ */}
      <Card>
        <CardHeader
          title="Collected by domain"
          subtitle={`Confirmed deposits per day, last ${days} days.`}
        />
        <div className="px-5 py-4">
          {chart ? (
            <>
              <LineChart
                series={chart.money}
                labels={chart.dayList.map(shortDay)}
                format={(value) =>
                  value >= 1000
                    ? `${Math.round(value / 1000)}k`
                    : String(Math.round(value))
                }
                emptyMessage="No confirmed deposits in this period."
              />
              <TableView
                columns={["Day", ...chart.money.map((line) => line.label)]}
                rows={chart.dayList.map((day, index) => [
                  day,
                  ...chart.money.map((line) =>
                    formatMoney(BigInt(Math.round(line.values[index] ?? 0)) * 100n, {
                      currency: "KSh",
                      whole: true,
                    }),
                  ),
                ])}
              />
            </>
          ) : (
            <Skeleton className="h-[220px] w-full" />
          )}
        </div>
      </Card>

      {/* --- Per-domain breakdown ---------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Domain breakdown"
            subtitle="Lifetime, real money only."
          />
          <div className="space-y-5 px-5 py-4">
            {sites ? (
              <>
                <Breakdown
                  title="Collected"
                  data={sites.map((site) => ({
                    id: site.id,
                    label: site.name,
                    value: Number(BigInt(site.depositMinor ?? "0") / 100n),
                    display: formatMoney(site.depositMinor ?? "0", {
                      currency: "KSh",
                      whole: true,
                    }),
                  }))}
                />
                <Breakdown
                  title="Paid out"
                  data={sites.map((site) => ({
                    id: site.id,
                    label: site.name,
                    value: Number(BigInt(site.withdrawalMinor ?? "0") / 100n),
                    display: formatMoney(site.withdrawalMinor ?? "0", {
                      currency: "KSh",
                      whole: true,
                    }),
                  }))}
                />
                <Breakdown
                  title="Customers"
                  data={sites.map((site) => ({
                    id: site.id,
                    label: site.name,
                    value: site.users,
                    display: site.users.toLocaleString(),
                  }))}
                />
              </>
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Sign-ups by domain"
            subtitle={`New accounts per day, last ${days} days.`}
          />
          <div className="px-5 py-4">
            {chart ? (
              <>
                <LineChart
                  series={chart.signups}
                  labels={chart.dayList.map(shortDay)}
                  format={(value) => String(Math.round(value))}
                  height={190}
                  emptyMessage="No sign-ups in this period."
                />
                <TableView
                  columns={["Day", ...chart.signups.map((line) => line.label)]}
                  rows={chart.dayList.map((day, index) => [
                    day,
                    ...chart.signups.map((line) => line.values[index] ?? 0),
                  ])}
                />
              </>
            ) : (
              <Skeleton className="h-[190px] w-full" />
            )}
          </div>
        </Card>
      </div>

      {/* --- The domains themselves -------------------------------------- */}
      {sites ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {sites.map((site, index) => (
            <SiteCard key={site.id} site={site} color={seriesColor(index)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** One measure, compared across domains. */
function Breakdown({
  title,
  data,
}: {
  title: string;
  data: { id: string; label: string; value: number; display: string }[];
}) {
  return (
    <div>
      <p className="adm-eyebrow mb-2.5">{title}</p>
      <BarRows data={data} />
    </div>
  );
}

/**
 * One product, in full.
 *
 * The net line is the only derived figure here, and it is stated as
 * collected − paid out rather than as "profit": what is left after payouts is
 * not the same as what the business earned, and a dashboard should not blur
 * the two.
 */
function SiteCard({ site, color }: { site: SiteTotals; color: string }) {
  const collected = BigInt(site.depositMinor ?? "0");
  const withdrawn = BigInt(site.withdrawalMinor ?? "0");
  const net = collected - withdrawn;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5" style={{ background: color }} />
            {site.name}
            {site.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
            {site.liveNow ? (
              <Badge tone="positive">
                <Radio size={10} />
                On air
              </Badge>
            ) : null}
          </span>
        }
        subtitle={site.origin.replace(/^https?:\/\//, "")}
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-3">
        <Figure
          label="Collected"
          value={formatMoney(collected, { currency: "KSh", whole: true })}
        />
        <Figure
          label="Paid out"
          value={formatMoney(withdrawn, { currency: "KSh", whole: true })}
        />
        <Figure
          label="Collected − paid out"
          value={formatMoney(net, { currency: "KSh", whole: true })}
          tone={net > 0n ? "pos" : net < 0n ? "neg" : undefined}
        />
        <Figure label="Customers" value={site.users.toLocaleString()} />
        <Figure label="Deposits" value={site.depositCount.toLocaleString()} />
        <Figure
          label="Broadcasts"
          value={`${site.sessions.toLocaleString()} · ${site.hosts} ${
            site.hosts === 1 ? "host" : "hosts"
          }`}
        />
      </dl>
    </Card>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div>
      <dt className="adm-eyebrow">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-[14px] font-medium tabular-nums text-adm-ink",
          tone === "pos" && "text-adm-pos",
          tone === "neg" && "text-adm-neg",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** `16 Aug` from `2026-08-16`. Short enough for an axis, unambiguous in a table. */
function shortDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
