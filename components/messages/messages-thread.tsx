"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStayFresh } from "@/lib/use-stay-fresh";
import { sendMessage, markMessagesRead } from "@/app/actions/messages";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  sender_role: "customer" | "mechanic";
  body: string;
  created_at: string;
}

interface MessagesThreadProps {
  bookingId: string;
  /** Whose screen this is — controls bubble alignment. */
  viewerRole: "customer" | "mechanic";
  counterpartName: string;
  className?: string;
}

// A booking's message thread, shared by the customer dashboard + the mechanic
// job view. Reads run client-side under RLS; sends go through the sendMessage
// server action. Kept live by polling (useStayFresh) — no Supabase Realtime, so
// no table replication needed. Chat wants snappier refresh than the page status,
// so it polls more often.
export function MessagesThread({
  bookingId,
  viewerRole,
  counterpartName,
  className,
}: MessagesThreadProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("id, sender_role, body, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    setMessages((data as Msg[]) ?? []);
  }, [bookingId]);

  // Initial load + mark the counterpart's messages read.
  useEffect(() => {
    load();
    markMessagesRead(bookingId).catch(() => {});
  }, [bookingId, load]);

  // Poll for new messages while the thread is open (and on tab refocus).
  useStayFresh(() => {
    load();
    markMessagesRead(bookingId).catch(() => {});
  }, 8_000);

  // Stick to the bottom as new messages arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function handleSend() {
    const body = draft.trim();
    if (!body || pending) return;
    setDraft("");
    startTransition(async () => {
      const res = await sendMessage(bookingId, body);
      if (!res.ok) {
        // Put the text back so it isn't lost.
        setDraft(body);
        return;
      }
      load();
    });
  }

  return (
    <div className={cn("flex flex-col rounded-2xl border border-border bg-surface-card", className)}>
      <div
        ref={scrollRef}
        className="flex max-h-80 min-h-40 flex-col gap-2 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-center text-sm text-text-muted">
            No messages yet. Say hello to {counterpartName}.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === viewerRole;
            return (
              <div
                key={m.id}
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                  mine
                    ? "self-end bg-brand-blue text-white"
                    : "self-start bg-surface text-text-primary",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn("mt-0.5 text-[10px]", mine ? "text-white/70" : "text-text-muted")}>
                  {new Date(m.created_at).toLocaleTimeString("en-GB", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={`Message ${counterpartName}…`}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={pending || !draft.trim()}
          aria-label="Send message"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-button bg-brand-blue text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
