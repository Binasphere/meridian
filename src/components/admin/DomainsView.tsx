"use client";

import { ArrowUpRight, Radio } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SiteTotals } from "@/lib/admin/types";
import { Badge, Card, CardHeader, Skeleton } from "./ui";
import { Donut, TableView } from "./charts";
import type { SitesState } from "./useSites";

/**
 * The domains the platform answers on, and what each one has brought in.
 *
 * Two products sharing one database, told apart by `cash_events.site` and
 * friends. This page is the reason that column exists: it is the only view in
 * the console that deliberately does *not* combine them.
 *
 * Every site appears even with nothing on it. A product that took no money is a
 * zero worth showing; a product missing from the list reads as a fault.
 */
export function DomainsView({ state }: { state: SitesState }) {
  const { sites, error, money } = state;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Domains"
          subtitle="Every address this platform answers on, and what each one has done."
        />

        {error ? (
          <p className="px-5 py-4 text-[13px] text-adm-neg">{error}</p>
        ) : null}

        {sites === null ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sites.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-adm-ink-3">
            No sites configured. Run <code>supabase/sites.sql</code>.
          </p>
        ) : (
          <SitesTable sites={sites} money={money} />
        )}
      </Card>

      {money && sites && sites.length > 0 ? <Comparison sites={sites} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Every domain, one row each.
 *
 * This was a stack of cards, each repeating its own labels — Customers,
 * Collected, Hosts, Broadcasts — beside its own figures. That reads acceptably
 * for one domain, badly for two, and turns into a wall at four: the labels
 * outnumber the numbers, and comparing the same measure across products means
 * scanning down a column that does not exist.
 *
 * A table states each label once and puts every product's figure beneath it, so
 * comparison is a glance down a column instead of a hunt. It is also the shape
 * that survives growth — a fifth domain is a fifth row, not another card.
 */
function SitesTable({ sites, money }: { sites: SiteTotals[]; money: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-adm-line bg-adm-raise">
            <Th className="text-left">Domain</Th>
            <Th>Customers</Th>
            {money ? <Th>Collected</Th> : null}
            <Th>Deposits</Th>
            <Th>Hosts</Th>
            <Th>Broadcasts</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-adm-line">
          {sites.map((site) => (
            <tr key={site.id} className="transition-colors hover:bg-adm-raise">
              <td className="px-4 py-3 text-left align-top">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-medium text-adm-ink">
                    {site.name}
                  </span>
                  {site.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
                  {site.liveNow ? (
                    <Badge tone="positive">
                      <Radio size={10} />
                      On air
                    </Badge>
                  ) : null}
                </div>
                {/* The address under the name rather than in its own column:
                    it is how you identify the row, not a figure to compare. */}
                <a
                  href={site.origin}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11.5px] text-adm-ink-3 transition-colors hover:text-adm-accent"
                >
                  {site.origin.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  <ArrowUpRight size={10} />
                </a>
              </td>

              <Td>{site.users.toLocaleString()}</Td>
              {money ? (
                <Td className="font-medium text-adm-ink">
                  {formatMoney(site.depositMinor ?? "0", {
                    currency: "KSh",
                    whole: true,
                  })}
                </Td>
              ) : null}
              <Td>{site.depositCount.toLocaleString()}</Td>
              <Td>{site.hosts.toLocaleString()}</Td>
              <Td>{site.sessions.toLocaleString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <td
      className={cn(
        "px-4 py-3 text-right align-top tabular-nums text-adm-ink-2",
        className,
      )}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------

/**
 * Where the money came from — collected, and only collected.
 *
 * Two donuts rather than one: **shillings** and **deposits** answer different
 * questions, and a product can lead on one while trailing the other. A single
 * chart would force a choice between them, and the difference between "most of
 * the money" and "most of the customers paying" is the whole story of which
 * product is worth the promotion budget.
 *
 * The caveat of the form is handled rather than ignored: an arc compares close
 * values badly, so the total sits in the hole and every slice carries its
 * amount and percentage in the legend. Nothing here has to be judged by eye.
 */
function Comparison({ sites }: { sites: SiteTotals[] }) {
  const money = sites.map((site) => ({
    id: site.id,
    label: site.name,
    value: Number(BigInt(site.depositMinor ?? "0") / 100n),
    display: formatMoney(site.depositMinor ?? "0", { currency: "KSh", whole: true }),
  }));

  const counts = sites.map((site) => ({
    id: site.id,
    label: site.name,
    value: site.depositCount,
    display: site.depositCount.toLocaleString(),
  }));

  const totalMinor = sites.reduce(
    (sum, site) => sum + BigInt(site.depositMinor ?? "0"),
    0n,
  );
  const totalCount = sites.reduce((sum, site) => sum + site.depositCount, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Collected by domain"
          subtitle="Confirmed deposits, lifetime. Demo handsets excluded."
        />
        <div className="px-5 py-5">
          <Donut
            slices={money}
            centreLabel="Collected"
            centreValue={formatMoney(totalMinor, { currency: "KSh", compact: true })}
          />
          <TableView
            columns={["Domain", "Collected", "Share"]}
            rows={money.map((row) => [
              row.label,
              row.display,
              totalMinor > 0n
                ? `${((row.value / Number(totalMinor / 100n)) * 100).toFixed(1)}%`
                : "—",
            ])}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Deposits by domain"
          subtitle="How many payments each product took."
        />
        <div className="px-5 py-5">
          <Donut
            slices={counts}
            centreLabel="Deposits"
            centreValue={totalCount.toLocaleString()}
          />
          <TableView
            columns={["Domain", "Deposits", "Share"]}
            rows={counts.map((row) => [
              row.label,
              row.display,
              totalCount > 0 ? `${((row.value / totalCount) * 100).toFixed(1)}%` : "—",
            ])}
          />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

