"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Search,
  SlidersHorizontal,
  UserX,
} from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatPhone, normalisePhone } from "@/lib/auth";
import type { AdminUser } from "@/lib/admin/types";
import type { LiveTier } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { Badge, Card, Skeleton, avatarTint, useNotify } from "./ui";
import type { UsersState } from "./useUsers";

/**
 * The user table — the console's working surface.
 *
 * One row per account, one privileged control per row. Everything else on the
 * row exists to let an admin be sure they are about to change the *right*
 * account: the name, the full number, and the balance at stake are all visible
 * at the moment of the click, so the decision is never made from a name alone.
 */

type SortKey = "created" | "name" | "live";
type TierFilter = "all" | LiveTier;

export function UsersView({ state }: { state: UsersState }) {
  const { users, loading, error, pending, setTier } = state;
  const notify = useNotify();

  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "created",
    desc: true,
  });

  const rows = useMemo(() => {
    if (!users) return null;

    const needle = query.trim().toLowerCase();
    // A number typed as "0712…" should match a stored "254712…", so the query
    // is normalised the same way sign-up normalises it before comparing.
    const asPhone = needle ? normalisePhone(needle) : null;

    const filtered = users.filter((user) => {
      if (tierFilter !== "all" && user.liveTier !== tierFilter) return false;
      if (!needle) return true;
      return (
        user.username.toLowerCase().includes(needle) ||
        user.phone.includes(needle) ||
        (asPhone !== null && user.phone === asPhone)
      );
    });

    const direction = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return direction * a.username.localeCompare(b.username);
        case "live": {
          const left = BigInt(a.liveBalanceMinor);
          const right = BigInt(b.liveBalanceMinor);
          return left === right ? 0 : direction * (left < right ? -1 : 1);
        }
        default:
          return (
            direction *
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          );
      }
    });
  }, [users, query, tierFilter, sort]);

  async function changeTier(user: AdminUser, tier: LiveTier) {
    const result = await setTier(user, tier);
    const name = user.username || formatPhone(user.phone);

    if (result.ok) {
      notify({
        tone: "success",
        title: `${name} moved to ${tier === "VIP" ? "VIP" : "Standard"}`,
        body:
          tier === "VIP"
            ? "New live contracts book at VIP payout terms."
            : "New live contracts book at standard payout terms.",
      });
    } else {
      notify({ tone: "error", title: "Could not change tier", body: result.reason });
    }
  }

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, desc: !current.desc }
        : { key, desc: key !== "name" },
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* --- Filter bar: every control in one row above the data ----------- */}
      <div className="flex flex-wrap items-center gap-3 border-b border-adm-line px-4 py-3 sm:px-5">
        <div className="relative min-w-0 flex-1 sm:max-w-[320px]">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-adm-ink-4"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or number"
            aria-label="Search users"
            className={cn(
              "h-9 w-full rounded-none border border-adm-line-strong bg-adm-surface pl-9 pr-3",
              "text-[13px] text-adm-ink outline-none transition-colors",
              "placeholder:text-adm-ink-3",
              "focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
            )}
          />
        </div>

        <TierFilterControl value={tierFilter} onChange={setTierFilter} />

        <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-adm-ink-3">
          {loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <SlidersHorizontal size={13} className="text-adm-ink-4" />
          )}
          {rows === null ? "Loading" : `${rows.length} shown`}
        </span>
      </div>

      {/* --- Column headings ----------------------------------------------
          Hidden below `lg`, where each record renders as a stacked card and
          labelled columns would be describing a layout that isn't there. */}
      <div className="hidden items-center gap-4 border-b border-adm-line bg-adm-raise px-5 py-2.5 lg:flex">
        <SortHeader
          className="flex-1"
          label="User"
          active={sort.key === "name"}
          desc={sort.desc}
          onClick={() => toggleSort("name")}
        />
        <SortHeader
          className="w-[130px] justify-end"
          label="Live balance"
          active={sort.key === "live"}
          desc={sort.desc}
          onClick={() => toggleSort("live")}
        />
        <span className="adm-eyebrow w-[130px] text-right">Demo balance</span>
        <SortHeader
          className="w-[100px]"
          label="Joined"
          active={sort.key === "created"}
          desc={sort.desc}
          onClick={() => toggleSort("created")}
        />
        <span className="adm-eyebrow w-[164px] text-right">Live tier</span>
      </div>

      {error ? (
        <EmptyState
          title="Could not load users"
          hint={error}
          tone="error"
        />
      ) : rows === null ? (
        <RowSkeletons />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            users && users.length === 0 ? "No accounts yet" : "No matching users"
          }
          hint={
            users && users.length === 0
              ? "Accounts appear here as soon as people sign up. Sign-up still runs on the local simulation, so nothing reaches Supabase yet."
              : "Try a different name or number, or clear the tier filter."
          }
        />
      ) : (
        <ul className="divide-y divide-adm-line">
          {rows.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              busy={Boolean(pending[user.id])}
              onSetTier={(tier) => void changeTier(user, tier)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function UserRow({
  user,
  busy,
  onSetTier,
}: {
  user: AdminUser;
  busy: boolean;
  onSetTier: (tier: LiveTier) => void;
}) {
  const avatar = avatarTint(user.id, user.username || user.phone);

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-adm-raise sm:px-5 lg:flex-row lg:items-center lg:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-none text-[12px] font-semibold"
          style={{ background: avatar.background, color: avatar.color }}
        >
          {avatar.initials}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-adm-ink">
              {user.username || "—"}
            </span>
            {user.liveTier === "VIP" ? <Badge tone="accent">VIP</Badge> : null}
          </div>
          <div className="tnum truncate font-mono text-[11.5px] text-adm-ink-3">
            {formatPhone(user.phone)}
          </div>
        </div>
      </div>

      <Cell label="Live balance" className="lg:w-[130px]">
        {formatMoney(user.liveBalanceMinor, { currency: "KSh" })}
      </Cell>
      <Cell label="Demo balance" className="lg:w-[130px]" muted>
        {formatMoney(user.demoBalanceMinor, { currency: "KSh" })}
      </Cell>
      <Cell label="Joined" className="lg:w-[100px] lg:text-left" muted>
        {new Date(user.createdAt).toLocaleDateString([], {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        })}
      </Cell>

      <div className="flex items-center justify-between gap-2 lg:w-[164px] lg:justify-end">
        <span className="adm-eyebrow lg:hidden">Live tier</span>
        <div className="flex items-center gap-2">
          {busy ? (
            <Loader2 size={13} className="animate-spin text-adm-ink-4" />
          ) : null}
          <TierToggle value={user.liveTier} disabled={busy} onChange={onSetTier} />
        </div>
      </div>
    </li>
  );
}

/** A value that carries its own label until the table's headings exist. */
function Cell({
  label,
  children,
  className,
  muted = false,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 lg:block lg:text-right",
        className,
      )}
    >
      <span className="adm-eyebrow lg:hidden">{label}</span>
      <span
        className={cn(
          "tnum font-mono text-[12.5px]",
          muted ? "text-adm-ink-3" : "text-adm-ink",
        )}
      >
        {children}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * The one privileged control.
 *
 * A two-state switch rather than a "Promote" button, because the action is
 * symmetric: putting someone back on Standard has to be exactly as easy as
 * moving them to VIP. A one-way button quietly makes mistakes expensive.
 */
function TierToggle({
  value,
  disabled,
  onChange,
}: {
  value: LiveTier;
  disabled: boolean;
  onChange: (tier: LiveTier) => void;
}) {
  const options: ReadonlyArray<{ value: LiveTier; label: string }> = [
    { value: "STANDARD", label: "Standard" },
    { value: "VIP", label: "VIP" },
  ];

  return (
    <div
      role="group"
      aria-label="Live tier"
      className="inline-flex items-center gap-0.5 rounded-none border border-adm-line-strong bg-adm-subtle p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-none px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-adm-accent",
              "disabled:pointer-events-none disabled:opacity-50",
              active
                ? "bg-adm-surface text-adm-ink"
                : "text-adm-ink-3 hover:text-adm-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TierFilterControl({
  value,
  onChange,
}: {
  value: TierFilter;
  onChange: (value: TierFilter) => void;
}) {
  const options: ReadonlyArray<{ value: TierFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "STANDARD", label: "Standard" },
    { value: "VIP", label: "VIP" },
  ];

  return (
    <div
      role="group"
      aria-label="Filter by tier"
      className="inline-flex items-center gap-0.5 rounded-none border border-adm-line-strong bg-adm-subtle p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-none px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
              active
                ? "bg-adm-surface text-adm-ink"
                : "text-adm-ink-3 hover:text-adm-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SortHeader({
  label,
  active,
  desc,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "adm-eyebrow flex items-center gap-1 transition-colors hover:text-adm-ink-2",
        active && "text-adm-ink-2",
        className,
      )}
    >
      {label}
      {active ? (
        desc ? (
          <ArrowDown size={11} />
        ) : (
          <ArrowUp size={11} />
        )
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function EmptyState({
  title,
  hint,
  tone = "neutral",
}: {
  title: string;
  hint: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-none",
          tone === "error" ? "bg-[#fdeceb] text-adm-neg" : "bg-adm-subtle text-adm-ink-4",
        )}
      >
        <UserX size={18} />
      </span>
      <p className="mt-1 text-[13.5px] font-medium text-adm-ink">{title}</p>
      <p className="max-w-[380px] text-[12.5px] leading-relaxed text-adm-ink-3">{hint}</p>
    </div>
  );
}

function RowSkeletons() {
  return (
    <ul className="divide-y divide-adm-line">
      {[0, 1, 2, 3, 4].map((index) => (
        <li key={index} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="h-9 w-9 rounded-none" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-40" />
          </div>
          <Skeleton className="hidden h-3 w-24 lg:block" />
          <Skeleton className="hidden h-3 w-24 lg:block" />
          <Skeleton className="h-7 w-[148px] rounded-none" />
        </li>
      ))}
    </ul>
  );
}
