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
const PAY_URL = "https://deon.ardena.co.ke/pay?inv=INV-2026-0006";
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
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#F26522] px-3.5 py-2 text-[12.5px] text-white"
    >
      <Clock size={14} className="shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          {overdue ? "Payment overdue" : "Payment reminder"}
        </span>
        {" · "}Pay the outstanding {AMOUNT_DUE} by {dueDate}
      </p>
      <span className="font-mono font-semibold tabular-nums">
        {overdue ? "Due now" : formatLeft(left)}
      </span>
      <a
        href={PAY_URL}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 bg-white px-2.5 py-1 font-semibold text-[#F26522] transition-opacity hover:opacity-90"
      >
        Pay now
      </a>
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
