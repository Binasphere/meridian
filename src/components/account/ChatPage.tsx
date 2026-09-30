"use client";

import { useEffect, useRef, useState } from "react";
import { MessagesSquare, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadChat, sendChat, subscribeChat, type ChatMessage } from "@/lib/chat";
import { Spinner } from "@/components/ui/Spinner";

/** One thread with support: messages above, the input pinned below. */
export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Merge by id: the sender's own insert arrives both as the send result and
  // on the realtime stream, and must show once.
  const add = (message: ChatMessage) =>
    setMessages((current) =>
      current?.some((m) => m.id === message.id) ? current : [...(current ?? []), message],
    );

  useEffect(() => {
    void loadChat().then(setMessages);
    return subscribeChat(add);
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const sent = await sendChat(text);
    setSending(false);
    if (sent) {
      add(sent);
      setDraft("");
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-13rem)] max-w-[720px] flex-col border border-line bg-surface-1 lg:h-full">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {messages === null ? (
          <div className="grid h-full place-items-center">
            <Spinner size={28} label="Loading chat" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessagesSquare className="h-7 w-7 text-ink-faint" aria-hidden />
            <p className="text-[13.5px] text-ink-muted">Send us a message.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.sender === "CUSTOMER";
              return (
                <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] px-3 py-2 text-[14px] leading-snug",
                      mine ? "bg-cash text-white" : "border border-line bg-surface-2 text-ink",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={cn(
                        "mt-1 text-right text-[10.5px]",
                        mine ? "text-white/70" : "text-ink-faint",
                      )}
                    >
                      {new Date(m.createdAt).toLocaleTimeString([], {
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
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex shrink-0 items-end gap-2 border-t border-line p-2.5"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Type a message"
          aria-label="Message"
          className="max-h-32 min-h-11 flex-1 resize-none border border-line-strong bg-surface-1 px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-cash"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cash text-white transition-colors hover:bg-cash-hover disabled:opacity-40"
        >
          {sending ? <Spinner size={16} onColor /> : <SendHorizontal className="h-5 w-5" aria-hidden />}
        </button>
      </form>
    </div>
  );
}
