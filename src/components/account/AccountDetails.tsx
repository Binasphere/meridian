"use client";

import { formatPhoneMasked, useCurrentAccount } from "@/lib/auth";
import { depositPhoneOf } from "@/lib/prefs";
import { useUi } from "@/lib/ui";
import { DetailRow } from "./views";

/** The account, and nothing else: who it is and how it signs in. */
export function AccountDetails() {
  const account = useCurrentAccount();
  const openDepositNumber = useUi((s) => s.setDepositNumberOpen);
  const openVerification = useUi((s) => s.setVerificationOpen);
  const depositPhone = depositPhoneOf(account);

  return (
    <div className="max-w-[560px]">
      <div className="border border-line bg-surface-1">
        <dl className="divide-y divide-line">
          <DetailRow label="Username" value={account?.username ?? "—"} />
          <DetailRow
            label="Registered number"
            value={account?.phone ? formatPhoneMasked(account.phone) : "—"}
            mono
          />
          <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="text-[12.5px] text-ink-muted">Deposit number</dt>
            <dd className="flex items-baseline gap-3">
              <span className="tnum font-mono text-[13px] text-ink-secondary">
                {depositPhone ? formatPhoneMasked(depositPhone) : "—"}
              </span>
              <button
                onClick={() => openDepositNumber(true)}
                className="text-[12px] font-semibold text-accent hover:underline"
              >
                Change
              </button>
            </dd>
          </div>
          <DetailRow
            label="Signs in with"
            value={account?.method === "google" ? (account.email ?? "Google") : "Number & password"}
          />
          <DetailRow
            label="Member since"
            value={
              account
                ? new Date(account.createdAt).toLocaleDateString([], {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"
            }
          />
          <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="text-[12.5px] text-ink-muted">Verification</dt>
            <dd className="flex items-baseline gap-3">
              <span className="text-[13px] text-up">Tier 1</span>
              <button
                onClick={() => openVerification(true)}
                className="text-[12px] font-semibold text-accent hover:underline"
              >
                View
              </button>
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
        Withdrawals are always paid to your registered number. To change it,
        raise a ticket on the Support page.
      </p>
    </div>
  );
}
