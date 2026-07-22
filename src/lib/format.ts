/**
 * Client-side formatting.
 *
 * Amounts arrive from the API as decimal strings of minor units and are parsed
 * to `bigint` here. They are never converted to `number` — a KES balance past
 * ~90 trillion cents would start losing precision, and more importantly the
 * habit is what keeps rounding bugs out of the codebase entirely.
 */

const MINOR = 100n;

export function toMinor(value: string | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

export function formatMoney(
  value: string | bigint,
  opts: { currency?: string; withSign?: boolean; compact?: boolean } = {},
): string {
  const { currency, withSign = false, compact = false } = opts;
  const minor = toMinor(value);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;

  let body: string;
  if (compact && abs >= 100_000_00n) {
    // 100k+ collapses to 1 decimal place: "KSh 1.2M". Only ever used in
    // summary tiles, never where an exact figure is expected.
    const major = Number(abs / MINOR);
    body =
      major >= 1_000_000
        ? `${(major / 1_000_000).toFixed(1)}M`
        : `${(major / 1_000).toFixed(1)}K`;
  } else {
    const major = abs / MINOR;
    const cents = abs % MINOR;
    body = `${major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents
      .toString()
      .padStart(2, "0")}`;
  }

  const sign = negative ? "−" : withSign ? "+" : "";
  return currency ? `${sign}${currency} ${body}` : `${sign}${body}`;
}

/** Splits a price so the last digits can be rendered larger — a terminal idiom. */
export function splitPrice(
  price: number,
  precision: number,
): { head: string; tail: string } {
  const text = price.toFixed(precision);
  // The last two digits are the ones that move tick to tick.
  const cut = Math.max(0, text.length - 2);
  return { head: text.slice(0, cut), tail: text.slice(cut) };
}

export function formatPrice(price: number, precision: number): string {
  return price.toFixed(precision);
}

/** `95` -> `"0:95"` is wrong; this gives `"1:35"`. */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? `${minutes}m` : `${(minutes).toFixed(1)}m`;
}

export function formatPercent(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** `"just now"`, `"3m ago"`, `"2h ago"`. */
export function formatRelative(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * A deterministic avatar from a seed string.
 *
 * Returns an HSL pair for a two-stop gradient plus initials. No uploads, no
 * external avatar service, no PII leaving the app — and it is stable, so a
 * given user always looks the same.
 */
export function avatarFrom(seed: string, displayName: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return {
    initials: initials || "?",
    background: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${
      (hue + 40) % 360
    } 50% 22%))`,
  };
}
