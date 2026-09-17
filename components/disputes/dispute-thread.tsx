"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStayFresh } from "@/lib/use-stay-fresh";
import { sendDisputeMessage } from "@/app/actions/disputes";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  sender_role: "customer" | "mechanic" | "admin";
  body: string;
  created_at: string;
  /** Evidence sent with the message (0085). */
  photos?: string[] | null;
  /** A private note from Book My Tech to one party (0085). Only an admin ever receives one not meant for them. */
  visible_to?: "mechanic" | "customer" | null;
}

type Audience = "everyone" | "mechanic" | "customer";

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "everyone", label: "Everyone sees this" },
  { value: "mechanic", label: "Only the mechanic sees this" },
  { value: "customer", label: "Only the customer sees this" },
];

const ROLE_LABEL: Record<Msg["sender_role"], string> = {
  customer: "Customer",
  mechanic: "Mechanic",
  admin: "Book My Tech",
};

// A dispute's 3-party thread (customer / mechanic / admin mediator). Reads run
// client-side under RLS; sends go through sendDisputeMessage. Kept live by
// polling (no Realtime). `closed` hides the composer once the case is resolved.
//
// Two things arrived with the mechanic app (Task 69, migration 0085): photos on
// a message, and a PRIVATE note from Book My Tech to one party. Privacy is the
// RLS policy's job, not this component's — a customer's browser never receives
// a note meant for the mechanic, so there is nothing here to hide. An admin
// receives everything, and sees who each note was for.
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
  const [audience, setAudience] = useState<Audience>("everyone");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const read = (columns: string) =>
      supabase.from("dispute_messages").select(columns).eq("dispute_id", disputeId).order("created_at", { ascending: true });
    let { data, error } = await read("id, sender_role, body, created_at, photos, visible_to");
    // Before 0085 the two new columns don't exist; the thread must still load.
    if (error) ({ data, error } = await read("id, sender_role, body, created_at"));
    setMessages((data as unknown as Msg[]) ?? []);
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
      const res = await sendDisputeMessage(disputeId, body, audience === "everyone" ? null : audience);
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
                  {m.visible_to && (
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide">
                      Private · only the {m.visible_to} sees this
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {(m.photos ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(m.photos ?? []).map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- evidence in the public job-media bucket, shown at thumbnail size */}
                          <img src={url} alt="Photo sent with this message" className="size-20 rounded-lg object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
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
        <div className="border-t border-border p-3">
          {viewerRole === "admin" && (
            <div className="mb-2 max-w-xs">
              <Select
                value={audience}
                onChange={setAudience}
                options={AUDIENCE_OPTIONS}
                aria-label="Who sees this message"
              />
            </div>
          )}
          <div className="flex items-end gap-2">
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
        </div>
      )}
    </div>
  );
}
