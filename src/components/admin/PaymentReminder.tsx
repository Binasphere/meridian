"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * A payment reminder for the console's owner, shown above every page.
 *
 * Edit the three constants to change it. Set `REMINDER_ACTIVE` to false once
 * the payment has arrived and the card disappears.
 */
const REMINDER_ACTIVE = true;
const AMOUNT_DUE = "KSh 15,000";
/** End of 30 Nov 2026, Nairobi time. */
const DUE_AT = new Date("2026-11-30T23:59:59+03:00");

export function PaymentReminder() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!REMINDER_ACTIVE || now === null) return null;

  const left = DUE_AT.getTime() - now;
  const overdue = left <= 0;
  const dueDate = DUE_AT.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-4 border border-[#f0b37a] bg-[#fff4e8] px-5 py-4"
    >
      <Clock size={20} className="shrink-0 text-[#c2580a]" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[#8a3c05]">
          {overdue ? "Payment overdue" : "Payment reminder"}
        </p>
        <p className="mt-0.5 text-[13px] text-[#9a4a12]">
          Please pay the outstanding {AMOUNT_DUE} by {dueDate}.
        </p>
      </div>
      <p className="font-mono text-[18px] font-semibold tabular-nums text-[#c2580a]">
        {overdue ? "Due now" : formatLeft(left)}
      </p>
    </div>
  );
}

function formatLeft(ms: number): string {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}
