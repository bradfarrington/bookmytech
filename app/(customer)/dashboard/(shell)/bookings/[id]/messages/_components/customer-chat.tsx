"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Lock, SendHorizontal } from "lucide-react";
import { markMessagesRead, sendMessage } from "@/app/actions/messages";
import { createClient } from "@/lib/supabase/client";
import { useStayFresh } from "@/lib/use-stay-fresh";
import { cn } from "@/lib/utils";
import { buttonClass, Caption, Notice } from "@/components/dashboard/ui";
import {
  groupMessagesByDay,
  hasUnreadFromMechanic,
  lastOwnMessageId,
  messageTime,
  type ChatMessage,
} from "./chat-format";

// The customer's side of a booking's message thread (mockup 04 "Messages").
// The mechanic side keeps components/messages/messages-thread.tsx; this uses
// the same data path: read `messages` under RLS with the browser client, send
// with the sendMessage action, mark read with markMessagesRead, and poll with
// useStayFresh (no Realtime). The page scrolls, and the composer is pinned to
// the bottom of the screen.

/** The thread, oldest first, or null when it couldn't be read. */
async function fetchThread(bookingId: string): Promise<ChatMessage[] | null> {
  try {
    const { data, error } = await createClient()
      .from("messages")
      .select("id, sender_role, body, created_at, read_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    return error ? null : ((data ?? []) as ChatMessage[]);
  } catch {
    return null;
  }
}

export function CustomerChat({
  bookingId,
  mechanicName,
  maxChars,
  closedMessage,
}: {
  bookingId: string;
  /** "Alex" */
  mechanicName: string;
  maxChars: number;
  /** Set when the thread is closed to new messages: why. */
  closedMessage: string | null;
}) {
  const closed = closedMessage != null;
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shownCount = useRef(0);

  const apply = useCallback(
    (thread: ChatMessage[] | null) => {
      if (!thread) {
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setNow(new Date());
      setMessages(thread);
      if (hasUnreadFromMechanic(thread)) markMessagesRead(bookingId).catch(() => {});
    },
    [bookingId],
  );

  const load = useCallback(() => fetchThread(bookingId).then(apply), [bookingId, apply]);

  useEffect(() => {
    let active = true;
    fetchThread(bookingId).then((thread) => {
      if (active) apply(thread);
    });
    return () => {
      active = false;
    };
  }, [bookingId, apply]);

  // Chat wants a quicker refresh than a page; a closed thread only refreshes
  // when the tab comes back into view.
  useStayFresh(() => {
    load();
  }, closed ? 0 : 8_000);

  // Follow the conversation down as messages arrive.
  useEffect(() => {
    if (!messages) return;
    if (messages.length > shownCount.current) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: shownCount.current === 0 ? "auto" : "smooth",
      });
    }
    shownCount.current = messages.length;
  }, [messages]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function send() {
    const body = draft.trim();
    if (!body || pending) return;
    if (body.length > maxChars) {
      setSendError(`Please keep your message to ${maxChars} characters or fewer.`);
      return;
    }
    setSendError(null);
    setDraft("");
    requestAnimationFrame(resizeTextarea);
    startTransition(async () => {
      try {
        const result = await sendMessage(bookingId, body);
        if (!result.ok) {
          setDraft(body);
          setSendError(result.error);
          return;
        }
        await load();
      } catch {
        setDraft(body);
        setSendError("We couldn't send your message. Please check your connection and try again.");
      }
    });
  }

  const days = messages ? groupMessagesByDay(messages, now) : [];
  const lastOwnId = messages ? lastOwnMessageId(messages) : null;
  const remaining = maxChars - draft.length;

  return (
    <>
      <div
        role="log"
        aria-label={`Messages with ${mechanicName}`}
        className="flex min-h-[calc(100dvh-17rem)] flex-col justify-end gap-2 pb-4 md:min-h-[calc(100dvh-13rem)]"
      >
        {messages === null ? (
          loadFailed ? (
            <Notice tone="danger" title="We couldn't load your messages">
              Please check your connection. We&apos;ll keep trying.
            </Notice>
          ) : (
            <Caption className="m-auto">Loading messages</Caption>
          )
        ) : messages.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-sm leading-[21px] text-text-muted">
            {closed ? "There were no messages on this booking." : `No messages yet. Say hello to ${mechanicName}.`}
          </p>
        ) : (
          days.map((day) => (
            <div key={day.key} className="flex flex-col gap-2">
              <Caption className="mb-1 mt-4 text-center">{day.label}</Caption>
              {day.messages.map((message) => {
                const mine = message.sender_role === "customer";
                const note = message.id === lastOwnId ? (message.read_at ? " · Read" : " · Sent") : "";
                return (
                  <div key={message.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap break-words px-3 py-2 text-[13px] leading-[19px] sm:max-w-[65%]",
                        mine
                          ? "rounded-[14px] rounded-br-[4px] bg-brand-blue text-white"
                          : "rounded-[14px] rounded-bl-[4px] border border-border bg-surface-card text-text-primary",
                      )}
                    >
                      {message.body}
                    </div>
                    <div className="mx-1 mt-0.5 text-[10.5px] leading-4 text-slate-400">
                      {mine ? "You" : mechanicName} · {messageTime(message.created_at)}
                      {note}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {closed ? (
        <div className="sticky bottom-0 z-10 bg-surface pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
          <Notice icon={Lock} title="Messages are closed">
            {closedMessage}
          </Notice>
        </div>
      ) : (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface-card px-3.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5 sm:-mx-6 sm:px-6 md:mx-0 md:rounded-t-2xl md:border-x md:px-3.5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="chat-draft" className="sr-only">
              Message {mechanicName}
            </label>
            <textarea
              id="chat-draft"
              ref={textareaRef}
              rows={1}
              value={draft}
              maxLength={maxChars}
              placeholder="Type a message…"
              onChange={(event) => {
                setDraft(event.target.value);
                if (sendError) setSendError(null);
                resizeTextarea();
              }}
              onKeyDown={(event) => {
                // Enter sends where there's a keyboard; on a phone it's a new line.
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  window.matchMedia("(hover: hover)").matches
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              className="max-h-[140px] min-h-11 flex-1 resize-none rounded-[10px] border border-border bg-surface-card px-3 py-2.5 text-base leading-5 text-text-primary placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue sm:text-sm"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              aria-label="Send message"
              className={buttonClass({ className: "size-11 rounded-full px-0" })}
            >
              <SendHorizontal size={18} aria-hidden />
            </button>
          </form>
          {remaining <= 200 && (
            <Caption className="mt-1 text-right">
              {remaining === 1 ? "1 character left" : `${remaining} characters left`}
            </Caption>
          )}
          {sendError && (
            <p role="alert" className="mt-1.5 text-xs font-medium leading-4 text-red-700">
              {sendError}
            </p>
          )}
        </div>
      )}
    </>
  );
}
