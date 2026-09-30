"use client";

import { useCallback, useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, CheckCircle2, ChevronDown, Inbox } from "lucide-react";
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

const labelOf = (value: TicketCategory) =>
  TICKET_CATEGORIES.find((c) => c.value === value)?.label ?? value;

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
        <Section title="New ticket">
          <TicketForm
            phoneLabel={account?.phone ? formatPhoneMasked(account.phone) : null}
            onSent={load}
          />
        </Section>
      </Column>

      {signedIn ? (
        <Column>
          <Section title="Your tickets" fill>
            {tickets === null ? (
              <div className="grid place-items-center py-10">
                <Spinner size={28} label="Loading tickets" />
              </div>
            ) : tickets.length === 0 ? (
              <Empty icon={<Inbox className="h-5 w-5" />} title="No tickets yet" />
            ) : (
              <ul className="divide-y divide-line">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                        {labelOf(ticket.category)}
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
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-secondary">
                      {ticket.message}
                    </p>
                    <div className="mt-1 text-[11px] text-ink-faint">
                      {formatRelative(new Date(ticket.createdAt).getTime())}
                    </div>
                    {ticket.adminNote ? (
                      <p className="mt-2 border-l-2 border-cash pl-3 text-[12.5px] text-ink">
                        {ticket.adminNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Column>
      ) : null}
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
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // `/support?topic=…` preselects the topic.
  useEffect(() => {
    const topic = new URLSearchParams(window.location.search).get("topic");
    if (topic && TICKET_CATEGORIES.some((c) => c.value === topic)) {
      setCategory(topic as TicketCategory);
    }
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await raiseTicket({
      category,
      // The topic is the subject; the description carries the rest.
      subject: labelOf(category),
      message,
      phone: phoneLabel ? undefined : phone,
    });
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setSent(true);
    setMessage("");
    toast.success("Ticket sent");
    onSent();
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-up" aria-hidden />
        <div className="text-[15px] font-semibold text-ink">Ticket sent</div>
        <button
          onClick={() => setSent(false)}
          className="h-10 border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-3"
        >
          New ticket
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
        <TopicSelect value={category} onChange={setCategory} />
      </div>

      {phoneLabel ? null : (
        <div>
          <label htmlFor="ticket-phone" className={label}>
            M-Pesa number
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
        <label htmlFor="ticket-message" className={label}>
          Description
        </label>
        <textarea
          id="ticket-message"
          rows={6}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
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
        disabled={busy || message.trim().length < 10 || (!phoneLabel && !phone)}
        className="flex h-11 items-center justify-center bg-cash text-[14px] font-semibold text-white transition-colors hover:bg-cash-hover disabled:pointer-events-none disabled:opacity-40"
      >
        {busy ? <Spinner size={18} onColor /> : "Send"}
      </button>
    </form>
  );
}

/** A dropdown drawn like the rest of the product, not the browser's select. */
function TopicSelect({
  value,
  onChange,
}: {
  value: TicketCategory;
  onChange: (value: TicketCategory) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "flex h-11 w-full items-center justify-between border border-line-strong bg-surface-1 px-3",
          "text-left text-[15px] text-ink transition-colors data-[state=open]:border-cash",
        )}
      >
        {labelOf(value)}
        <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="rise-in z-50 w-[var(--radix-dropdown-menu-trigger-width)] border border-line bg-surface-1 py-1 shadow-[0_12px_32px_-8px_rgba(8,12,24,0.28)]"
        >
          {TICKET_CATEGORIES.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-[14px] text-ink outline-none data-[highlighted]:bg-surface-2"
            >
              {option.label}
              {option.value === value ? <Check className="h-4 w-4 text-cash" aria-hidden /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
