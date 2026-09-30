"use client";

import { cn } from "@/lib/utils";
import type { StoredAccount } from "@/lib/auth";

/** The profile photo, or initials on ink, always round. */
export function Avatar({
  account,
  size = 40,
  className,
}: {
  account: StoredAccount | null;
  size?: number;
  className?: string;
}) {
  const initials = account
    ? (account.username?.slice(0, 2) ?? account.phone.slice(-2)).toUpperCase()
    : "—";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink font-semibold text-surface-1",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden
    >
      {account?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
