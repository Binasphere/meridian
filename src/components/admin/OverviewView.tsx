"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/auth";
import type { AdminUser } from "@/lib/admin/types";
import { Badge, Card, CardHeader, Skeleton, StatTile, TierMeter, avatarTint } from "./ui";

/**
 * Overview.
 *
 * Every figure here is derived from the same list the Users table renders, so
 * the two can never disagree. Nothing is invented to fill the page: there is no
 * revenue line, no fake trend, no sparkline over data that does not exist yet.
 * An admin dashboard that decorates itself with numbers it cannot substantiate
 * teaches you to distrust the ones it can.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function OverviewView({ users }: { users: AdminUser[] | null }) {
  const summary = useMemo(() => {
    if (!users) return null;

    const now = Date.now();
    let vip = 0;
    let live = 0n;
    let demo = 0n;
    let thisWeek = 0;

    for (const user of users) {
      if (user.liveTier === "VIP") vip += 1;
      live += BigInt(user.liveBalanceMinor);
      demo += BigInt(user.demoBalanceMinor);
      if (now - new Date(user.createdAt).getTime() < WEEK_MS) thisWeek += 1;
    }

    const recent = [...users]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 6);

    return { total: users.length, vip, standard: users.length - vip, live, demo, thisWeek, recent };
  }, [users]);

  if (!summary) return <OverviewSkeleton />;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="sr-only">Summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Total users"
            value={summary.total.toLocaleString()}
            hint={
              summary.thisWeek > 0
                ? `${summary.thisWeek} joined in the last 7 days`
                : "No sign-ups in the last 7 days"
            }
          />
          <StatTile
            label="VIP members"
            value={summary.vip.toLocaleString()}
            hint={
              summary.total === 0
                ? "—"
                : `${Math.round((summary.vip / summary.total) * 100)}% of all accounts`
            }
          />
          {/* Compact at display size, exact underneath. A tile is a glance, not
              a statement of account — but the exact figure has to be somewhere,
              because "KSh 1.2M" is not a number anyone can act on. */}
          <StatTile
            label="Live balances"
            value={formatMoney(summary.live, { currency: "KSh", compact: true })}
            hint={`${formatMoney(summary.live, { currency: "KSh" })} across all live accounts`}
          />
          <StatTile
            label="Demo balances"
            value={formatMoney(summary.demo, { currency: "KSh", compact: true })}
            hint="Practice funds — not real money"
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader
            title="Tier split"
            subtitle="Payout terms new live contracts are booked at"
          />
          <div className="p-5">
            <TierMeter standard={summary.standard} vip={summary.vip} />
            <p className="mt-4 border-t border-adm-line pt-4 text-[12.5px] leading-relaxed text-adm-ink-3">
              VIP books every contract at a flat 4× payout, frozen onto the
              contract when it is opened, so a change of tier applies to the next
              trade and never revalues a settled one.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent sign-ups" subtitle="Newest accounts first" />
          {summary.recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-adm-ink-3">
              No accounts yet.
            </p>
          ) : (
            <ul className="divide-y divide-adm-line">
              {summary.recent.map((user) => {
                const avatar = avatarTint(user.id, user.username || user.phone);
                return (
                  <li key={user.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center text-[11px] font-semibold"
                      style={{ background: avatar.background, color: avatar.color }}
                    >
                      {avatar.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-adm-ink">
                        {user.username || "—"}
                      </div>
                      <div className="tnum truncate font-mono text-[11.5px] text-adm-ink-3">
                        {formatPhone(user.phone)}
                      </div>
                    </div>
                    {user.liveTier === "VIP" ? <Badge tone="accent">VIP</Badge> : null}
                    <span className="tnum shrink-0 text-[12px] text-adm-ink-3">
                      {new Date(user.createdAt).toLocaleDateString([], {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-6 w-24" />
            <Skeleton className="mt-3 h-3 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-5 h-2 w-full" />
          <Skeleton className="mt-4 h-3 w-40" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-3 w-28" />
          <div className="mt-5 space-y-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
