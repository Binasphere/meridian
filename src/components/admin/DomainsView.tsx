"use client";

import { ArrowUpRight, Check, Globe, Radio } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SiteTotals } from "@/lib/admin/types";
import { Badge, Card, CardHeader, Skeleton } from "./ui";
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

      {money && sites && sites.length > 1 ? <Comparison sites={sites} /> : null}
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

          <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
            <Figure label="Customers" value={site.users.toLocaleString()} />
            {money ? (
              <>
                <Figure
                  label="Deposited"
                  value={formatMoney(site.depositMinor ?? "0", {
                    currency: "KSh",
                    whole: true,
                  })}
                  hint={`${site.depositCount} deposits`}
                />
                <Figure
                  label="Withdrawn"
                  value={formatMoney(site.withdrawalMinor ?? "0", {
                    currency: "KSh",
                    whole: true,
                  })}
                  hint={`${site.withdrawalCount} paid out`}
                />
                <Figure
                  label="Held"
                  value={formatMoney(site.liveBalanceMinor ?? "0", {
                    currency: "KSh",
                    whole: true,
                  })}
                  hint="Customer balances"
                />
              </>
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
 * Side by side, as a share of the whole.
 *
 * A bar rather than a second table of the same numbers: the question this
 * answers is "which product is carrying the platform", and a proportion answers
 * it at a glance where two totals require arithmetic.
 */
function Comparison({ sites }: { sites: SiteTotals[] }) {
  const amounts = sites.map((site) => ({
    id: site.id,
    name: site.name,
    minor: BigInt(site.depositMinor ?? "0"),
  }));

  const total = amounts.reduce((sum, row) => sum + row.minor, 0n);

  return (
    <Card>
      <CardHeader
        title="Share of deposits"
        subtitle="Confirmed deposits, lifetime, by product."
      />
      <div className="px-5 py-4">
        {total === 0n ? (
          <p className="text-[13px] text-adm-ink-3">
            No confirmed deposits on any domain yet.
          </p>
        ) : (
          <>
            <div className="flex h-2.5 w-full overflow-hidden bg-adm-subtle">
              {amounts.map((row, index) => (
                <div
                  key={row.id}
                  style={{
                    width: `${Number((row.minor * 1000n) / total) / 10}%`,
                  }}
                  className={cn(
                    index === 0 ? "bg-adm-accent" : "bg-adm-ink-3",
                    "transition-[width] duration-500",
                  )}
                />
              ))}
            </div>

            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {amounts.map((row, index) => (
                <li key={row.id} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "h-2.5 w-2.5",
                      index === 0 ? "bg-adm-accent" : "bg-adm-ink-3",
                    )}
                  />
                  <span className="text-[12.5px] text-adm-ink-2">{row.name}</span>
                  <span className="text-[12.5px] tabular-nums text-adm-ink-3">
                    {total === 0n
                      ? "0%"
                      : `${(Number((row.minor * 1000n) / total) / 10).toFixed(1)}%`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
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
