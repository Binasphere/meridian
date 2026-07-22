"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, LayoutList, ListOrdered, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { DURATIONS, type Instrument } from "@/lib/market/instruments";
import { payoutFromStake } from "@/lib/trading";
import { selectBalance, useOpenTrades, useStore } from "@/lib/store";
import { Watchlist } from "./Watchlist";
import { Positions } from "./Positions";

const QUICK_STAKES = [10_000n, 25_000n, 50_000n, 100_000n];

/**
 * The mobile trading bar.
 *
 * Phones are the majority of this market, so the small-screen layout is a
 * designed thing rather than a reflow of the desktop grid. The chart keeps the
 * screen; everything needed to act sits in a fixed bar within thumb reach, and
 * the two lists become sheets.
 *
 * There is exactly one chart instance in the app — this bar and the desktop
 * rail arrange the *same* mounted chart rather than each rendering their own,
 * which is why the layout switches with CSS and not with a media-query branch
 * that would remount the canvas.
 */
export function MobileBar({ spec }: { spec: Instrument }) {
  const stakeMinor = useStore((s) => BigInt(s.stakeMinor));
  const setStakeMinor = useStore((s) => s.setStakeMinor);
  const durationSec = useStore((s) => s.durationSec);
  const setDuration = useStore((s) => s.setDuration);
  const placeTrade = useStore((s) => s.placeTrade);
  const setSymbol = useStore((s) => s.setSymbol);
  const balance = useStore(selectBalance);
  const open = useOpenTrades();

  const [marketsOpen, setMarketsOpen] = useState(false);
  const [positionsOpen, setPositionsOpen] = useState(false);

  const insufficient = stakeMinor > balance || stakeMinor <= 0n;
  const potential = payoutFromStake(stakeMinor, spec.payoutBps);

  const submit = (direction: "UP" | "DOWN") => {
    const result = placeTrade(direction);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    toast.success(`${direction === "UP" ? "▲ Higher" : "▼ Lower"} · ${spec.short}`, {
      description: `${formatMoney(stakeMinor, { currency: "KSh" })} at ${result.trade.openPrice.toFixed(spec.precision)}`,
    });
  };

  return (
    <div className="shrink-0 border-t border-line bg-surface-1 lg:hidden">
      {/* --- Sheet triggers + stake ---------------------------------------- */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <SheetButton
          icon={<LayoutList className="h-4 w-4" />}
          label="Markets"
          onClick={() => setMarketsOpen(true)}
        />
        <SheetButton
          icon={<ListOrdered className="h-4 w-4" />}
          label="Positions"
          badge={open.length || undefined}
          onClick={() => setPositionsOpen(true)}
        />

        <div className="ml-auto text-right">
          <div className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">
            Returns
          </div>
          <div className="tnum -mt-0.5 font-mono text-[14px] font-medium text-ink">
            {formatMoney(potential, { currency: "KSh" })}
          </div>
        </div>
      </div>

      {/* --- Stake + expiry ------------------------------------------------- */}
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK_STAKES.map((amount) => (
          <Chip
            key={amount.toString()}
            active={stakeMinor === amount}
            onClick={() => setStakeMinor(amount)}
          >
            {formatMoney(amount, { compact: true })}
          </Chip>
        ))}
        <div className="mx-1 w-px shrink-0 bg-line" aria-hidden />
        {DURATIONS.map((d) => (
          <Chip
            key={d.seconds}
            active={durationSec === d.seconds}
            onClick={() => setDuration(d.seconds)}
          >
            {d.label}
          </Chip>
        ))}
      </div>

      {/* --- Commit --------------------------------------------------------- */}
      <div
        className="grid grid-cols-2 gap-2 px-3 pb-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => submit("UP")}
          disabled={insufficient}
          className="flex h-12 items-center justify-center gap-1.5 rounded-none border border-up/30 bg-up/12 text-[15px] font-semibold text-up transition-colors active:bg-up/20 disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
          Higher
        </button>
        <button
          onClick={() => submit("DOWN")}
          disabled={insufficient}
          className="flex h-12 items-center justify-center gap-1.5 rounded-none border border-down/30 bg-down/12 text-[15px] font-semibold text-down transition-colors active:bg-down/20 disabled:opacity-40"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
          Lower
        </button>
      </div>

      <Sheet
        open={marketsOpen}
        onOpenChange={setMarketsOpen}
        title="Markets"
      >
        <Watchlist
          active={spec.symbol}
          onSelect={(symbol) => {
            setSymbol(symbol);
            setMarketsOpen(false);
          }}
        />
      </Sheet>

      <Sheet
        open={positionsOpen}
        onOpenChange={setPositionsOpen}
        title="Positions"
      >
        <Positions />
      </Sheet>
    </div>
  );
}

function SheetButton({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex h-9 items-center gap-1.5 rounded-none border border-line bg-surface-2 px-2.5 text-[12.5px] text-ink-secondary active:bg-surface-3"
    >
      {icon}
      {label}
      {badge ? (
        <span className="tnum rounded-none bg-accent/20 px-1 font-mono text-[10px] text-accent">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "tnum h-8 shrink-0 rounded-none border px-3 font-mono text-[12px] transition-colors",
        active
          ? "border-line-strong bg-surface-3 text-ink"
          : "border-line bg-surface-1 text-ink-muted",
      )}
    >
      {children}
    </button>
  );
}

/** A bottom sheet. Radix handles focus trapping, scroll lock and Escape. */
function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "sheet-content fixed inset-x-0 bottom-0 z-50 flex h-[78dvh] flex-col",
            "rounded-none border-t border-line bg-surface-1 shadow-2xl",
            "focus:outline-none",
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="text-[13px] font-medium text-ink">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-none text-ink-muted active:bg-surface-3"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
