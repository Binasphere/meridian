"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare, SendHorizontal } from "lucide-react";
import { adminFetch } from "@/lib/admin/client";
import { formatPhone } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Card, Skeleton, useNotify } from "./ui";

interface Thread {
  userId: string;
  username: string | null;
  phone: string | null;
  last: string;
  lastSender: "CUSTOMER" | "AGENT";
  lastAt: string;
  unread: number;
}

interface Message {
  id: string;
  sender: "CUSTOMER" | "AGENT";
  body: string;
  createdAt: string;
}

const POLL_MS = 5000;

/**
 * Live chat, the agent's side: conversations on the left, the open thread on
 * the right. Polled rather than streamed — the console has no Supabase
 * session, and five seconds is quick enough for a person typing.
 */
export function ChatsView({ onUnauthorised }: { onUnauthorised: () => void }) {
  const notify = useNotify();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const get = useCallback(
    async <T,>(path: string): Promise<T | null> => {
      const response = await adminFetch(path).catch(() => null);
      if (response?.status === 401) {
        onUnauthorised();
        return null;
      }
      if (!response?.ok) return null;
      return (await response.json()) as T;
    },
    [onUnauthorised],
  );

  const loadThreads = useCallback(async () => {
    const body = await get<{ chats: Thread[] }>("/api/admin/chats");
    if (body) setThreads(body.chats);
    else setThreads((t) => t ?? []);
  }, [get]);

  const loadThread = useCallback(
    async (userId: string) => {
      const body = await get<{ messages: Message[] }>(`/api/admin/chats/${userId}`);
      if (body) setMessages(body.messages);
    },
    [get],
  );

  useEffect(() => {
    void loadThreads();
    const id = setInterval(() => {
      void loadThreads();
      if (active) void loadThread(active);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadThreads, loadThread, active]);

  useEffect(() => {
    if (!active) return;
    setMessages(null);
    void loadThread(active);
  }, [active, loadThread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function reply() {
    const text = draft.trim();
    if (!active || !text) return;
    setSending(true);
    const response = await adminFetch(`/api/admin/chats/${active}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    }).catch(() => null);
    setSending(false);
    if (!response?.ok) {
      notify({ tone: "error", title: "Could not send" });
      return;
    }
    const { message } = (await response.json()) as { message: Message };
    setMessages((m) => [...(m ?? []), message]);
    setDraft("");
  }

  const current = threads?.find((t) => t.userId === active) ?? null;

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="max-h-[70vh] overflow-y-auto">
        {threads === null ? (
          <div className="p-3">
            <Skeleton className="h-12" />
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <MessagesSquare size={20} className="text-adm-ink-4" />
            <div className="text-[13px] text-adm-ink-3">No conversations yet</div>
          </div>
        ) : (
          <ul className="divide-y divide-adm-line">
            {threads.map((t) => (
              <li key={t.userId}>
                <button
                  onClick={() => setActive(t.userId)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors",
                    active === t.userId ? "bg-adm-accent-tint" : "hover:bg-adm-subtle",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-adm-ink">
                      {t.username ?? (t.phone ? formatPhone(t.phone) : "Customer")}
                    </span>
                    <span className="block truncate text-[12px] text-adm-ink-3">
                      {t.lastSender === "AGENT" ? "You: " : ""}
                      {t.last}
                    </span>
                  </span>
                  {t.unread > 0 ? (
                    <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-adm-accent px-1.5 text-[10.5px] font-semibold text-white">
                      {t.unread}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex h-[70vh] flex-col">
        {!active ? (
          <div className="grid flex-1 place-items-center text-[13px] text-adm-ink-3">
            Choose a conversation
          </div>
        ) : (
          <>
            <div className="border-b border-adm-line px-4 py-3">
              <div className="text-[14px] font-semibold text-adm-ink">
                {current?.username ?? "Customer"}
              </div>
              {current?.phone ? (
                <div className="tnum font-mono text-[12px] text-adm-ink-3">
                  {formatPhone(current.phone)}
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {messages === null ? (
                <Skeleton className="h-16" />
              ) : (
                <ul className="flex flex-col gap-2">
                  {messages.map((m) => {
                    const agent = m.sender === "AGENT";
                    return (
                      <li key={m.id} className={cn("flex", agent ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[75%] px-3 py-2 text-[13.5px]",
                            agent
                              ? "bg-adm-ink text-white"
                              : "border border-adm-line bg-adm-subtle text-adm-ink",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={cn("mt-1 text-right text-[10.5px]", agent ? "text-white/60" : "text-adm-ink-4")}>
                            {new Date(m.createdAt).toLocaleString([], {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div ref={bottom} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void reply();
              }}
              className="flex items-end gap-2 border-t border-adm-line p-2.5"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void reply();
                  }
                }}
                rows={1}
                placeholder="Reply"
                className="min-h-10 flex-1 resize-none rounded-none border border-adm-line-strong bg-adm-surface px-3 py-2 text-[13.5px] text-adm-ink outline-none focus:border-adm-accent"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send"
                className="grid h-10 w-10 place-items-center rounded-full bg-adm-ink text-white disabled:opacity-40"
              >
                <SendHorizontal size={16} />
              </button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
