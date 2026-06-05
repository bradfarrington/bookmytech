"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStayFresh } from "@/lib/use-stay-fresh";
import { sendDisputeMessage } from "@/app/actions/disputes";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  sender_role: "customer" | "mechanic" | "admin";
  body: string;
  created_at: string;
}

const ROLE_LABEL: Record<Msg["sender_role"], string> = {
  customer: "Customer",
  mechanic: "Mechanic",
  admin: "Book My Tech",
};

// A dispute's 3-party thread (customer / mechanic / admin mediator). Reads run
// client-side under RLS; sends go through sendDisputeMessage. Kept live by
// polling (no Realtime). `closed` hides the composer once the case is resolved.
export function DisputeThread({
  disputeId,
  viewerRole,
  closed,
}: {
  disputeId: string;
  viewerRole: "customer" | "mechanic" | "admin";
  closed?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("dispute_messages")
      .select("id, sender_role, body, created_at")
      .eq("dispute_id", disputeId)
      .order("created_at", { ascending: true });
    setMessages((data as Msg[]) ?? []);
  }, [disputeId]);

  useEffect(() => {
    load();
  }, [load]);

  useStayFresh(() => {
    load();
  }, 8_000);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function handleSend() {
    const body = draft.trim();
    if (!body || pending) return;
    setDraft("");
    startTransition(async () => {
      const res = await sendDisputeMessage(disputeId, body);
      if (!res.ok) {
        setDraft(body);
        return;
      }
      load();
    });
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface-card">
      <div ref={scrollRef} className="flex max-h-96 min-h-40 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="m-auto text-center text-sm text-text-muted">
            No messages yet. Explain your side and we&apos;ll help resolve it.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === viewerRole;
            return (
              <div key={m.id} className={cn("max-w-[82%]", mine ? "self-end" : "self-start")}>
                <p className={cn("mb-0.5 text-[10px] font-semibold uppercase tracking-wide", mine ? "text-right text-brand-blue" : "text-text-muted")}>
                  {ROLE_LABEL[m.sender_role]}
                </p>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm",
                    m.sender_role === "admin"
                      ? "bg-amber-50 text-amber-900"
                      : mine
                        ? "bg-brand-blue text-white"
                        : "bg-surface text-text-primary",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-0.5 text-[10px]", mine && m.sender_role !== "admin" ? "text-white/70" : "text-text-muted")}>
                    {new Date(m.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {closed ? (
        <p className="border-t border-border p-3 text-center text-xs text-text-muted">
          This dispute is closed.
        </p>
      ) : (
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
            placeholder="Add to the conversation…"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={pending || !draft.trim()}
            aria-label="Send"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-button bg-brand-blue text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
