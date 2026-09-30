import { cn } from "@/lib/utils";

/**
 * Instrument marks.
 *
 * Drawn locally rather than fetched: a logo CDN is one more thing to fail on a
 * slow connection, and a market list with holes in it reads as broken. Each coin
 * is its brand colour with its customary glyph, and every pair carries the
 * quote currency's flag tucked under its bottom-right edge — the way a pair is
 * read, base first and quote second.
 *
 * Round, where the rest of the product is square: these are the coins' own
 * marks and flags, which are content, not chrome.
 */
const COINS: Record<string, { bg: string; fg?: string; glyph: string }> = {
  BTC: { bg: "#F7931A", glyph: "₿" },
  ETH: { bg: "#627EEA", glyph: "Ξ" },
  BNB: { bg: "#F3BA2F", fg: "#1E2026", glyph: "B" },
  SOL: { bg: "#9945FF", glyph: "S" },
  XRP: { bg: "#23292F", glyph: "X" },
  ADA: { bg: "#0033AD", glyph: "₳" },
  AVAX: { bg: "#E84142", glyph: "A" },
  DOT: { bg: "#E6007A", glyph: "●" },
  NEAR: { bg: "#111111", glyph: "N" },
  ATOM: { bg: "#2E3148", glyph: "⚛" },
  SUI: { bg: "#4DA2FF", glyph: "S" },
  TRX: { bg: "#FF060A", glyph: "T" },
  XLM: { bg: "#14161B", glyph: "✦" },
  LTC: { bg: "#345D9D", glyph: "Ł" },
  BCH: { bg: "#0AC18E", glyph: "₿" },
  FIL: { bg: "#0090FF", glyph: "F" },
  LINK: { bg: "#2A5ADA", glyph: "⬡" },
  UNI: { bg: "#FF007A", glyph: "U" },
  AAVE: { bg: "#B6509E", glyph: "A" },
  INJ: { bg: "#0082FA", glyph: "I" },
  ARB: { bg: "#28A0F0", glyph: "A" },
  OP: { bg: "#FF0420", glyph: "OP" },
  DOGE: { bg: "#C2A633", glyph: "Ð" },
  SHIB: { bg: "#FFA409", glyph: "S" },
  PEPE: { bg: "#3D8130", glyph: "P" },
};

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
  const coin = COINS[short] ?? { bg: "#5d6677", glyph: short.slice(0, 1) };
  const flagSize = Math.round(size * 0.52);

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="grid h-full w-full place-items-center rounded-full font-semibold leading-none"
        style={{
          background: coin.bg,
          color: coin.fg ?? "#ffffff",
          fontSize: Math.round(size * (coin.glyph.length > 1 ? 0.36 : 0.5)),
        }}
      >
        {coin.glyph}
      </span>
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
