"use client";

import { useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { myReferrals, type ReferralStats } from "@/lib/referral";
import { Spinner } from "@/components/ui/Spinner";

export function ReferralsPage() {
  const [stats, setStats] = useState<ReferralStats | null | undefined>(undefined);

  useEffect(() => {
    void myReferrals().then(setStats);
  }, []);

  if (stats === undefined) {
    return (
      <div className="grid h-40 max-w-[480px] place-items-center border border-line bg-surface-1">
        <Spinner size={28} label="Loading" />
      </div>
    );
  }
  if (stats === null) {
    return (
      <div className="max-w-[480px] border border-line bg-surface-1 p-5 text-[13px] text-ink-muted">
        Referrals are not available right now.
      </div>
    );
  }

  const link = `${window.location.origin}/?ref=${stats.code}`;

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ url: link }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(link);
      toast.success("Link copied");
    }
  };

  return (
    <div className="max-w-[480px] border border-line bg-surface-1 p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        Your link
      </div>
      <div className="mt-2 flex items-stretch border border-line-strong">
        <span className="tnum min-w-0 flex-1 truncate px-3 py-2.5 font-mono text-[13px] text-ink">
          {link}
        </span>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(link);
            toast.success("Link copied");
          }}
          aria-label="Copy link"
          className="grid w-11 place-items-center border-l border-line-strong text-ink-muted hover:text-ink"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px border border-line bg-line">
        <div className="bg-surface-1 p-4">
          <div className="tnum font-mono text-[26px] font-semibold text-ink">{stats.joined}</div>
          <div className="text-[12px] text-ink-muted">Joined</div>
        </div>
        <div className="bg-surface-1 p-4">
          <div className="tnum font-mono text-[26px] font-semibold text-ink">{stats.funded}</div>
          <div className="text-[12px] text-ink-muted">Deposited</div>
        </div>
      </div>

      <button
        onClick={() => void share()}
        className="mt-5 flex h-11 w-full items-center justify-center gap-2 bg-cash text-[14px] font-semibold text-white transition-colors hover:bg-cash-hover"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Share link
      </button>
    </div>
  );
}
