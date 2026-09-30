"use client";

import { BACKEND_ORIGIN } from "./backend";
import { supabase } from "./supabase/client";

export type TicketCategory =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRADING"
  | "ACCOUNT"
  | "PASSWORD"
  | "OTHER";

export const TICKET_CATEGORIES: ReadonlyArray<{ value: TicketCategory; label: string }> = [
  { value: "DEPOSIT", label: "Deposit" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
  { value: "TRADING", label: "Trading" },
  { value: "ACCOUNT", label: "Account & verification" },
  { value: "PASSWORD", label: "Forgot password" },
  { value: "OTHER", label: "Something else" },
];

export interface Ticket {
  id: string;
  category: TicketCategory;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  adminNote: string | null;
  createdAt: string;
}

/**
 * Raises a ticket through the payments service, which rate-limits it and
 * works signed out. A session, when there is one, rides along so the ticket
 * is tied to the account and shows up under "Your tickets".
 */
export async function raiseTicket(input: {
  category: TicketCategory;
  subject: string;
  message: string;
  phone?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = supabase();
  const token = db ? (await db.auth.getSession()).data.session?.access_token : undefined;

  try {
    const response = await fetch(`${BACKEND_ORIGIN}/api/support/tickets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) return { ok: false, reason: body.error ?? "Could not send the ticket" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "Could not reach support. Check your connection." };
  }
}

/** The signed-in customer's own tickets; RLS limits the read to them. */
export async function myTickets(): Promise<Ticket[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db
    .from("support_tickets")
    .select("id, category, subject, message, status, admin_note, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
  }));
}
