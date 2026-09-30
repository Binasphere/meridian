import { cn } from "@/lib/utils";

/**
 * Instrument marks: each coin's own logo, clipped round, with the quote
 * currency's flag tucked under its bottom-right edge — base first, quote
 * second, the way a pair is read.
 *
 * The logos ship with the app (`public/coins`, from web3icons, MIT) rather
 * than from a CDN, so a slow connection never leaves the list with holes.
 * Round, where the rest of the product is square: these are the coins' own
 * marks, which are content, not chrome.
 */
const LOGOS = new Set([
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "AVAX", "DOT", "NEAR", "ATOM",
  "SUI", "TRX", "XLM", "LTC", "BCH", "FIL", "LINK", "UNI", "AAVE", "INJ",
  "ARB", "OP", "DOGE", "SHIB", "PEPE",
]);

export function CoinIcon({
  short,
  size = 28,
  flag = true,
  className,
}: {
  short: string;
  size?: number;
  /** The quote currency's flag. Every pair here is quoted in USD. */
  flag?: boolean;
  className?: string;
}) {
  const flagSize = Math.round(size * 0.52);

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {LOGOS.has(short) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/coins/${short.toLowerCase()}.svg`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full rounded-full ring-1 ring-line"
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center rounded-full bg-ink-muted font-semibold text-white"
          style={{ fontSize: Math.round(size * 0.45) }}
        >
          {short.slice(0, 1)}
        </span>
      )}
      {flag ? (
        <UsFlag
          size={flagSize}
          className="absolute -bottom-0.5 -right-1 ring-2 ring-surface-1"
        />
      ) : null}
    </span>
  );
}

/** A round US flag — stripes, canton, no stars at this size. */
export function UsFlag({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={cn("overflow-hidden rounded-full", className)}
      aria-hidden
    >
      {/* `rounded-full` on the svg clips it; no clipPath id to collide when
          two dozen of these share a page. */}
      <rect width="20" height="20" fill="#ffffff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 20) / 13} width="20" height={20 / 13} fill="#B22234" />
      ))}
      <rect width="10" height={(20 / 13) * 7} fill="#3C3B6E" />
    </svg>
  );
}

/** A round Kenyan flag — the account currency's mark beside every balance. */
export function KenyaFlag({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={cn("shrink-0 overflow-hidden rounded-full", className)}
      aria-hidden
    >
      <rect width="20" height="20" fill="#ffffff" />
      <rect width="20" height="6" fill="#000000" />
      <rect y="7" width="20" height="6" fill="#bb0000" />
      <rect y="14" width="20" height="6" fill="#006600" />
      {/* The Maasai shield, reduced to what survives at 20px. */}
      <ellipse cx="10" cy="10" rx="2.6" ry="5.2" fill="#bb0000" stroke="#000000" strokeWidth="0.8" />
      <ellipse cx="10" cy="10" rx="0.9" ry="2.4" fill="#000000" />
    </svg>
  );
}
