"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { formatPhoneMasked, useAuth, useCurrentAccount } from "@/lib/auth";
import {
  myTickets,
  raiseTicket,
  TICKET_CATEGORIES,
  type Ticket,
  type TicketCategory,
} from "@/lib/support";
import { Empty } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/Spinner";
import { Column, Columns, Section } from "./AccountShell";

const FAQS = [
  {
    q: "How is a contract decided?",
    a: "At expiry the price at that exact instant is compared with your entry price. Buy wins if it closed above, Sell if it closed below. A close exactly at your entry returns your stake.",
  },
  {
    q: "How long do deposits and withdrawals take?",
    a: "The M-Pesa prompt arrives on your deposit number within seconds and the balance updates once you enter your PIN. Withdrawals are reviewed and paid to your registered number, usually within a few hours.",
  },
  {
    q: "Can I deposit from a different number?",
    a: "Yes. Open the menu → Deposit number and save any Safaricom or Airtel line. Withdrawals always go to your registered number.",
  },
  {
    q: "I forgot my password.",
    a: "Raise a ticket with the topic “Forgot password”. We call your registered number to confirm it is you, then issue a temporary password.",
  },
];

const PLACEHOLDER: Record<TicketCategory, string> = {
  DEPOSIT: "e.g. Deposit of KSh 1,000 not showing",
  WITHDRAWAL: "e.g. Withdrawal still pending",
  TRADING: "e.g. Question about a contract result",
  ACCOUNT: "e.g. Verify my account",
  PASSWORD: "I can't sign in",
  OTHER: "What can we help with?",
};

export function SupportPage() {
  const account = useCurrentAccount();
  const signedIn = useAuth((s) => s.currentPhone) !== null;

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const load = useCallback(async () => {
    if (!signedIn) return setTickets([]);
    setTickets(await myTickets());
  }, [signedIn]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Columns count={2}>
      <Column>
        <Section title="Raise a ticket" description="We reply by phone or SMS, usually within a few hours.">
          <TicketForm
            phoneLabel={account?.phone ? formatPhoneMasked(account.phone) : null}
            onSent={load}
          />
        </Section>
      </Column>

      <Column>
        {signedIn ? (
          <Section title="Your tickets" fill>
            {tickets === null ? (
              <div className="grid place-items-center py-10">
                <Spinner size={28} label="Loading tickets" />
              </div>
            ) : tickets.length === 0 ? (
              <Empty
                icon={<Inbox className="h-5 w-5" />}
                title="No tickets yet"
                hint="Anything you raise shows up here with its status."
              />
            ) : (
              <ul className="divide-y divide-line">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                        {ticket.subject}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                          ticket.status === "OPEN"
                            ? "border-warning/40 text-warning"
                            : "border-up/30 text-up",
                        )}
                      >
                        {ticket.status === "OPEN" ? "Open" : "Resolved"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-faint">
                      {TICKET_CATEGORIES.find((c) => c.value === ticket.category)?.label} ·{" "}
                      {formatRelative(new Date(ticket.createdAt).getTime())}
                    </div>
                    {ticket.adminNote ? (
                      <p className="mt-2 border-l-2 border-line-strong pl-3 text-[12.5px] leading-relaxed text-ink-secondary">
                        {ticket.adminNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        <Section title="Common questions">
          <div className="divide-y divide-line">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group px-4 py-3.5">
                <summary className="cursor-pointer list-none text-[13.5px] font-medium text-ink marker:hidden">
                  <span className="flex items-start gap-2">
                    <ChevronRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    {faq.q}
                  </span>
                </summary>
                <p className="mt-2 pl-6 text-[12.5px] leading-relaxed text-ink-secondary">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </Section>
      </Column>
    </Columns>
  );
}

function TicketForm({
  phoneLabel,
  onSent,
}: {
  /** The signed-in number, masked; null when signed out. */
  phoneLabel: string | null;
  onSent: () => void;
}) {
  const [category, setCategory] = useState<TicketCategory>("DEPOSIT");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // `/support?topic=PASSWORD` — where "Forgot password?" lands.
  useEffect(() => {
    const topic = new URLSearchParams(window.location.search).get("topic");
    if (topic && TICKET_CATEGORIES.some((c) => c.value === topic)) {
      setCategory(topic as TicketCategory);
      if (topic === "PASSWORD") setSubject("I can't sign in");
    }
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await raiseTicket({
      category,
      subject,
      message,
      phone: phoneLabel ? undefined : phone,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setSent(true);
    setSubject("");
    setMessage("");
    toast.success("Ticket sent", { description: "We'll be in touch shortly." });
    onSent();
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-up" aria-hidden />
        <div className="text-[15px] font-semibold text-ink">We have your ticket</div>
        <p className="max-w-[320px] text-[12.5px] leading-relaxed text-ink-muted">
          Our team will contact you on {phoneLabel ?? "the number you gave"}.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-2 h-10 border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-3"
        >
          Raise another
        </button>
      </div>
    );
  }

  const label = "mb-1.5 block text-[12px] font-medium text-ink-secondary";
  const input =
    "w-full border border-line-strong bg-surface-1 px-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-cash";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-4">
      <div>
        <span className={label}>Topic</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Topic">
          {TICKET_CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={category === option.value}
              onClick={() => setCategory(option.value)}
              className={cn(
                "h-8 border px-3 text-[12.5px] font-medium transition-colors",
                category === option.value
                  ? "border-ink bg-ink text-surface-1"
                  : "border-line-strong text-ink-secondary hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {phoneLabel ? (
        <p className="text-[12px] text-ink-muted">
          We will reply to <span className="tnum font-mono text-ink">{phoneLabel}</span>.
        </p>
      ) : (
        <div>
          <label htmlFor="ticket-phone" className={label}>
            M-Pesa number on your account
          </label>
          <input
            id="ticket-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0712 345 678"
            className={cn(input, "tnum h-11 font-mono")}
          />
        </div>
      )}

      <div>
        <label htmlFor="ticket-subject" className={label}>
          Subject
        </label>
        <input
          id="ticket-subject"
          maxLength={120}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={PLACEHOLDER[category]}
          className={cn(input, "h-11")}
        />
      </div>

      <div>
        <label htmlFor="ticket-message" className={label}>
          Details
        </label>
        <textarea
          id="ticket-message"
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Amounts, times and M-Pesa references help us sort it faster."
          className={cn(input, "resize-y py-2.5 leading-relaxed")}
        />
      </div>

      {error ? (
        <div role="alert" className="text-[12.5px] text-down">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy || subject.trim().length < 3 || message.trim().length < 10 || (!phoneLabel && !phone)}
        className="flex h-11 items-center justify-center bg-cash text-[14px] font-semibold text-white transition-colors hover:bg-cash-hover disabled:pointer-events-none disabled:opacity-40"
      >
        {busy ? <Spinner size={18} onColor /> : "Send ticket"}
      </button>
    </form>
  );
}
