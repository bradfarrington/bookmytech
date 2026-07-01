"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { postResolutionMessage } from "@/app/actions/resolutions";
import type { ResolutionRole } from "@/lib/resolutions/constants";

export interface ThreadMessage {
  id: string;
  senderRole: ResolutionRole;
  body: string;
  createdAt: string;
}

// Internal 2-party thread (mechanic ↔ admin). Never shown to customers.
export function CaseThread({
  caseId,
  messages,
  viewerRole,
}: {
  caseId: string;
  messages: ThreadMessage[];
  viewerRole: ResolutionRole;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await postResolutionMessage(caseId, trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-text-primary">Internal thread</h2>

      {messages.length === 0 ? (
        <p className="text-sm text-text-muted">No messages yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => {
            const mine = m.senderRole === viewerRole;
            return (
              <li key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "bg-brand-blue text-white" : "bg-surface text-text-primary",
                  )}
                >
                  {m.body}
                </div>
                <span className="text-[11px] text-text-muted">
                  {m.senderRole === "admin" ? "Book My Tech" : "Mechanic"} ·{" "}
                  {new Date(m.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          rows={2}
          placeholder="Write a message…"
          className="flex-1 resize-none rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !body.trim()}
          aria-label="Send message"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
