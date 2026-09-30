"use client";

import { supabase } from "./supabase/client";

export interface ChatMessage {
  id: string;
  sender: "CUSTOMER" | "AGENT";
  body: string;
  createdAt: string;
}

interface ChatRow {
  id: string;
  sender: string;
  body: string;
  created_at: string;
}

const toMessage = (row: ChatRow): ChatMessage => ({
  id: row.id,
  sender: row.sender === "AGENT" ? "AGENT" : "CUSTOMER",
  body: row.body,
  createdAt: row.created_at,
});

/** The customer's own thread, oldest first. RLS limits it to them. */
export async function loadChat(): Promise<ChatMessage[]> {
  const db = supabase();
  if (!db) return [];
  const { data } = await db
    .from("chat_messages")
    .select("id, sender, body, created_at")
    .order("created_at", { ascending: true })
    .limit(500);
  return (data ?? []).map(toMessage);
}

export async function sendChat(body: string): Promise<ChatMessage | null> {
  const db = supabase();
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await db
    .from("chat_messages")
    .insert({ user_id: auth.user.id, sender: "CUSTOMER", body: body.slice(0, 2000) })
    .select("id, sender, body, created_at")
    .single();
  if (error || !data) return null;
  return toMessage(data);
}

/**
 * New messages in this customer's thread as they are written, from either
 * side. Returns the unsubscribe.
 */
export function subscribeChat(onMessage: (message: ChatMessage) => void): () => void {
  const db = supabase();
  if (!db) return () => {};
  let channel: ReturnType<typeof db.channel> | null = null;
  let cancelled = false;

  void db.auth.getUser().then(({ data }) => {
    const uid = data.user?.id;
    if (!uid || cancelled) return;
    channel = db
      .channel(`chat:${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `user_id=eq.${uid}` },
        (payload) => onMessage(toMessage(payload.new as ChatRow)),
      )
      .subscribe();
  });

  return () => {
    cancelled = true;
    if (channel) void db.removeChannel(channel);
  };
}
