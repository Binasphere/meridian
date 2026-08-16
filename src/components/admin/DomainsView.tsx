"use client";

import { ArrowUpRight, Check, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_DOMAINS, domainHost } from "@/lib/admin/domains";
import { Badge, Card, CardHeader } from "./ui";

/**
 * The domains the platform answers on.
 *
 * Read-only, and it says so rather than implying otherwise. Both domains
 * currently serve the same build against the same database, so there is no
 * per-domain figure that could be shown honestly and no setting that could be
 * changed here without a `site` column to change it in.
 *
 * The "not yet separated" panel is therefore the most useful thing on the page:
 * it states exactly what is shared today, which is the question anyone opening
 * this screen is actually asking.
 */
export function DomainsView() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Domains"
          subtitle="Every address this platform answers on."
        />
        <ul className="divide-y divide-adm-line">
          {PLATFORM_DOMAINS.map((domain) => (
            <li key={domain.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-none bg-adm-subtle text-adm-ink-2"
                >
                  <Globe size={15} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-adm-ink">
                      {domain.name}
                    </span>
                    {domain.primary ? <Badge tone="accent">Primary</Badge> : null}
                    <Badge>
                      <Check size={10} />
                      Live
                    </Badge>
                  </div>

                  <a
                    href={domain.origin}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 font-mono text-[12px] text-adm-ink-3 transition-colors hover:text-adm-accent"
                  >
                    {domainHost(domain)}
                    <ArrowUpRight size={11} />
                  </a>

                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-adm-ink-3">
                    {domain.note}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <NotSeparatedNotice />
    </div>
  );
}

/**
 * What is shared, stated plainly.
 *
 * Written as facts rather than as a feature list with ticks missing, because
 * the reader's real question is "if I look at Users right now, whose users am I
 * looking at" — and the answer is "both domains', mixed, with no way to tell
 * them apart". That is worth saying in one sentence at the top.
 */
function NotSeparatedNotice() {
  const shared: { label: string; detail: string }[] = [
    {
      label: "Customer accounts",
      detail:
        "One account works on both domains. A customer who signs up on either can sign in on the other with the same balance.",
    },
    {
      label: "Deposits and withdrawals",
      detail:
        "Every cash event lands in one ledger with nothing recording which domain raised it.",
    },
    {
      label: "Broadcasts",
      detail:
        "One live session at a time across the whole platform, not one per domain, and its takings count deposits from both.",
    },
    {
      label: "Branding",
      detail:
        "Both domains serve the same build, so both currently present under the same name and wordmark.",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Not yet separated"
        subtitle="What the two domains share today."
        action={
          <span className="inline-flex items-center gap-1.5 border border-adm-line-strong bg-adm-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-adm-ink-3">
            <Lock size={10} />
            Coming soon
          </span>
        }
      />

      <div className="px-5 py-4">
        <p className="text-[13px] leading-relaxed text-adm-ink-2">
          Every figure elsewhere in this console —{" "}
          <span className="font-medium text-adm-ink">Overview</span>,{" "}
          <span className="font-medium text-adm-ink">Users</span>,{" "}
          <span className="font-medium text-adm-ink">Withdrawals</span>,{" "}
          <span className="font-medium text-adm-ink">Sessions</span> — currently
          covers <span className="font-medium text-adm-ink">both domains
          together</span>, with no way to tell them apart.
        </p>

        <ul className="mt-4 space-y-3">
          {shared.map((item) => (
            <li
              key={item.label}
              className={cn(
                "border-l-2 border-adm-line-strong pl-3",
                "text-[12.5px] leading-relaxed text-adm-ink-3",
              )}
            >
              <span className="block font-medium text-adm-ink-2">{item.label}</span>
              {item.detail}
            </li>
          ))}
        </ul>

        <p className="mt-5 border-t border-adm-line pt-4 text-[12px] leading-relaxed text-adm-ink-3">
          Splitting them means stamping every account, deposit and broadcast with
          the domain it came from, then teaching this console to filter on it.
          Until that exists, this page is deliberately read-only rather than
          offering switches that would not be connected to anything.
        </p>
      </div>
    </Card>
  );
}
