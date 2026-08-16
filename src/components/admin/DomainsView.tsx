"use client";

import { ArrowUpRight, Check, Globe, Radio } from "lucide-react";
import { formatMoney } from "@/lib/format";
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
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : sites.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-adm-ink-3">
            No sites configured. Run <code>supabase/sites.sql</code>.
          </p>
        ) : (
          <ul className="divide-y divide-adm-line">
            {sites.map((site) => (
              <SiteRow key={site.id} site={site} money={money} />
            ))}
          </ul>
        )}
      </Card>

      {money && sites && sites.length > 0 ? <Comparison sites={sites} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SiteRow({ site, money }: { site: SiteTotals; money: boolean }) {
  const host = site.origin.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-none bg-adm-subtle text-adm-ink-2"
        >
          <Globe size={15} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium text-adm-ink">{site.name}</span>
            {site.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
            {site.liveNow ? (
              <Badge tone="positive">
                <Radio size={10} />
                On air
              </Badge>
            ) : (
              <Badge>
                <Check size={10} />
                Live
              </Badge>
            )}
          </div>

          <a
            href={site.origin}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 font-mono text-[12px] text-adm-ink-3 transition-colors hover:text-adm-accent"
          >
            {host}
            <ArrowUpRight size={11} />
          </a>

          {/* Collected and nothing else financial. Withdrawals and held
              balances are the platform's obligations, not a domain's takings,
              and this page is about what each product brought in. Both live on
              Overview, where the whole ledger belongs. */}
          <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
            <Figure label="Customers" value={site.users.toLocaleString()} />
            {money ? (
              <Figure
                label="Collected"
                value={formatMoney(site.depositMinor ?? "0", {
                  currency: "KSh",
                  whole: true,
                })}
                hint={`${site.depositCount} deposits`}
              />
            ) : (
              <Figure label="Deposits" value={site.depositCount.toLocaleString()} />
            )}
            <Figure label="Hosts" value={site.hosts.toLocaleString()} />
            <Figure label="Broadcasts" value={site.sessions.toLocaleString()} />
          </dl>
        </div>
      </div>
    </li>
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

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="adm-eyebrow">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium tabular-nums text-adm-ink">
        {value}
      </dd>
      {hint ? <p className="text-[11.5px] text-adm-ink-3">{hint}</p> : null}
    </div>
  );
}
