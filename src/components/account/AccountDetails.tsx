"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Camera, ChevronRight, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhoneMasked, useCurrentAccount } from "@/lib/auth";
import { AVATAR_ACCEPT, uploadAvatar } from "@/lib/avatar";
import { depositPhoneOf } from "@/lib/prefs";
import { useUi } from "@/lib/ui";
import { myVerification, type VerificationStatus } from "@/lib/verification";
import { Spinner } from "@/components/ui/Spinner";
import { Avatar } from "./Avatar";

const STATUS: Record<VerificationStatus, { label: string; tone: string }> = {
  NONE: { label: "Not verified", tone: "text-ink-muted" },
  PENDING: { label: "Under review", tone: "text-warning" },
  APPROVED: { label: "Verified", tone: "text-up" },
  REJECTED: { label: "Action needed", tone: "text-down" },
};

/** The account as a handful of cards: who, the numbers, and trust. */
export function AccountDetails() {
  const account = useCurrentAccount();
  const openDepositNumber = useUi((s) => s.setDepositNumberOpen);
  const openVerification = useUi((s) => s.setVerificationOpen);
  const depositPhone = depositPhoneOf(account);

  const [status, setStatus] = useState<VerificationStatus | null>(null);
  useEffect(() => {
    void myVerification().then((v) => setStatus(v.status));
  }, []);

  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const onPhoto = async (picked: File | undefined) => {
    if (!picked) return;
    setUploading(true);
    const result = await uploadAvatar(picked);
    setUploading(false);
    if (!result.ok) toast.error(result.reason);
    else toast.success("Photo updated");
  };

  const since = account
    ? new Date(account.createdAt).toLocaleDateString([], { month: "long", year: "numeric" })
    : "—";

  return (
    <div className="grid max-w-[880px] gap-3 lg:grid-cols-2">
      {/* --- Identity --------------------------------------------------- */}
      <div className="flex items-center gap-4 border border-line bg-surface-1 p-5 lg:col-span-2">
        <div className="relative">
          <Avatar account={account} size={72} />
          <button
            onClick={() => file.current?.click()}
            disabled={uploading}
            aria-label="Change photo"
            className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-surface-1 bg-cash text-white transition-colors hover:bg-cash-hover"
          >
            {uploading ? <Spinner size={14} onColor /> : <Camera className="h-4 w-4" aria-hidden />}
          </button>
          <input
            ref={file}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            onChange={(e) => void onPhoto(e.target.files?.[0])}
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[20px] font-semibold tracking-tight text-ink">
            {account?.username ?? "—"}
          </div>
          <div className="tnum font-mono text-[13px] text-ink-muted">
            {account?.phone ? formatPhoneMasked(account.phone) : "—"}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-faint">Member since {since}</div>
        </div>
      </div>

      {/* --- Numbers ---------------------------------------------------- */}
      <Card icon={Smartphone} title="M-Pesa">
        <Line label="Registered" value={account?.phone ? formatPhoneMasked(account.phone) : "—"} mono />
        <Line
          label="Deposits from"
          value={depositPhone ? formatPhoneMasked(depositPhone) : "—"}
          mono
          action={{ label: "Change", onClick: () => openDepositNumber(true) }}
        />
      </Card>

      {/* --- Trust ------------------------------------------------------ */}
      <Card icon={BadgeCheck} title="Verification">
        <div className="flex items-center justify-between px-4 py-3">
          <span className={cn("text-[14px] font-semibold", status ? STATUS[status].tone : "text-ink-muted")}>
            {status ? STATUS[status].label : "…"}
          </span>
          {status !== "APPROVED" ? (
            <button
              onClick={() => openVerification(true)}
              className="h-9 bg-cash px-4 text-[13px] font-semibold text-white transition-colors hover:bg-cash-hover"
            >
              {status === "PENDING" ? "View" : "Verify"}
            </button>
          ) : null}
        </div>
      </Card>

      <Card icon={ShieldCheck} title="Sign-in">
        <Line
          label="Method"
          value={account?.method === "google" ? (account.email ?? "Google") : "Number & password"}
        />
        <Link
          href="/security"
          className="flex items-center justify-between px-4 py-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
        >
          Password & two-step
          <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
        </Link>
      </Card>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-surface-1">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon className="h-4 w-4 text-ink-muted" aria-hidden />
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{title}</h2>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Line({
  label,
  value,
  mono = false,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn("truncate text-[13.5px] text-ink", mono && "tnum font-mono")}>{value}</span>
        {action ? (
          <button onClick={action.onClick} className="shrink-0 text-[12.5px] font-semibold text-accent hover:underline">
            {action.label}
          </button>
        ) : null}
      </span>
    </div>
  );
}
