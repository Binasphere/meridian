"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { formatPhone } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { AdminTicket } from "@/lib/admin/types";
import { Badge, Button, Card, Skeleton, useNotify } from "./ui";
import { ResetPasswordControl } from "./ResetPasswordControl";
import type { TicketFilter, TicketsState } from "./useTickets";

const CATEGORY_LABEL: Record<AdminTicket["category"], string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRADING: "Trading",
  ACCOUNT: "Account",
  PASSWORD: "Forgot password",
  OTHER: "Other",
};

/**
 * The support queue: open tickets first, one card each. A note is what the
 * customer sees on their Support page, so it is written to them.
 */
export function TicketsView({ state }: { state: TicketsState }) {
  const filters: TicketFilter[] = ["OPEN", "RESOLVED", "ALL"];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => state.setFilter(f)}
            className={cn(
              "h-8 rounded-none border px-3 text-[12.5px] font-medium transition-colors",
              state.filter === f
                ? "border-adm-ink bg-adm-ink text-white"
                : "border-adm-line-strong bg-adm-surface text-adm-ink-2 hover:text-adm-ink",
            )}
          >
            {f === "OPEN" ? "Open" : f === "RESOLVED" ? "Resolved" : "All"}
          </button>
        ))}
      </div>

      {state.error ? (
        <Card className="p-4 text-[13px] text-adm-neg">{state.error}</Card>
      ) : null}

      {state.tickets === null || (state.loading && state.tickets.length === 0) ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : state.tickets.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Inbox size={20} className="text-adm-ink-4" />
          <div className="text-[13.5px] font-medium text-adm-ink">Nothing here</div>
          <div className="text-[12.5px] text-adm-ink-3">
            {state.filter === "OPEN" ? "Every ticket has been dealt with." : "No tickets match."}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {state.tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} state={state} />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket, state }: { ticket: AdminTicket; state: TicketsState }) {
  const notify = useNotify();
  const [note, setNote] = useState(ticket.adminNote ?? "");
  const [saving, setSaving] = useState(false);

  async function save(status?: "OPEN" | "RESOLVED") {
    setSaving(true);
    const result = await state.update(ticket.id, {
      ...(status ? { status } : {}),
      adminNote: note.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      notify({ tone: "error", title: "Could not update", body: result.reason });
    } else {
      notify({
        tone: "success",
        title: status === "RESOLVED" ? "Ticket resolved" : status === "OPEN" ? "Ticket reopened" : "Note saved",
      });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-adm-ink">{ticket.subject}</span>
        <Badge tone={ticket.category === "PASSWORD" ? "accent" : "neutral"}>
          {CATEGORY_LABEL[ticket.category]}
        </Badge>
        {ticket.status === "RESOLVED" ? <Badge tone="positive">Resolved</Badge> : null}
        <span className="ml-auto text-[11.5px] text-adm-ink-3">
          {new Date(ticket.createdAt).toLocaleString([], {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className="mt-1 text-[12px] text-adm-ink-3">
        <span className="tnum font-mono text-adm-ink-2">{formatPhone(ticket.phone)}</span>
        {ticket.username ? ` · ${ticket.username}` : " · not signed in"}
        {ticket.site ? ` · ${ticket.site}` : ""}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-adm-ink-2">
        {ticket.message}
      </p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Note to the customer (shown on their Support page)"
        className="mt-3 w-full resize-y rounded-none border border-adm-line-strong bg-adm-surface px-3 py-2 text-[13px] text-adm-ink outline-none focus:border-adm-accent"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ticket.status === "OPEN" ? (
          <Button variant="primary" disabled={saving} onClick={() => void save("RESOLVED")}>
            Resolve
          </Button>
        ) : (
          <Button disabled={saving} onClick={() => void save("OPEN")}>
            Reopen
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={saving || note.trim() === (ticket.adminNote ?? "")}
          onClick={() => void save()}
        >
          Save note
        </Button>
        {/* A signed-out password ticket carries a number, not an account: find
            the account under Users by that number, confirm by phone, reset there. */}
        {ticket.category === "PASSWORD" && ticket.userId ? (
          <ResetPasswordControl userId={ticket.userId} name={ticket.username ?? "the customer"} />
        ) : ticket.category === "PASSWORD" ? (
          <span className="text-[11.5px] text-adm-ink-3">
            Find {formatPhone(ticket.phone)} under Users to reset.
          </span>
        ) : null}
      </div>
    </Card>
  );
}
