import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { loadMechanicThreads } from "@/lib/messages/threads";
import { formatJobNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

// The mechanic's Messages screen (Task 60).
//
// Until now a thread was reachable only by opening its job. There was no nav
// item and no unread count, so a customer's question sat unseen unless the
// mechanic happened to open that booking — the SMS fallback sweep was the only
// thing that made a message noticeable at all.
//
// Read through the mechanic's OWN client, so the `messages` and `bookings`
// SELECT policies scope it and this page needs no ownership filter of its own.
// Only open jobs: a completed or cancelled booking's thread is closed to new
// messages, so listing it in an inbox would imply a reply that isn't possible.

function timeLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) {
    return at.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return "Yesterday";
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function MechanicMessagesInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const threads = await loadMechanicThreads(supabase, user.id);
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Messages</h1>
        <p className="text-sm text-text-muted">
          Threads on your current jobs. Anything waiting on you is at the top.
        </p>
      </div>

      {threads.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-surface text-text-muted">
            <MessagesSquare size={20} aria-hidden />
          </span>
          <p className="text-sm font-semibold text-text-primary">No messages yet</p>
          <p className="max-w-sm text-sm text-text-muted">
            When a customer messages you about one of your jobs, the thread appears here. You can
            also open it from the job itself.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li key={thread.bookingId}>
                <Link
                  href={`/mechanic/jobs/${thread.bookingId}/messages`}
                  className="flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface md:px-5"
                >
                  <span
                    className={
                      thread.unread > 0
                        ? "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue"
                        : "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-text-muted"
                    }
                  >
                    <MessageSquare size={17} aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {thread.customerName?.split(" ")[0] || "Customer"}
                        {thread.jobNumber != null && (
                          <span className="ml-1.5 font-normal text-text-muted">
                            {formatJobNumber(thread.jobNumber)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-text-muted">
                        {timeLabel(thread.lastAt, now)}
                      </span>
                    </span>

                    {/* line-clamp-2, not truncate: the point of the preview is
                        to judge whether it needs answering now. */}
                    <span className="mt-0.5 line-clamp-2 block text-sm text-text-secondary">
                      {!thread.lastFromCustomer && (
                        <span className="text-text-muted">You: </span>
                      )}
                      {thread.lastBody}
                    </span>

                    <span className="mt-1 block truncate text-xs text-text-muted">
                      {thread.repairDescription}
                      {thread.vehicleReg && <> · {thread.vehicleReg}</>}
                    </span>
                  </span>

                  {thread.unread > 0 && (
                    <span
                      className="mt-0.5 flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue px-1.5 text-[11px] font-bold text-white"
                      aria-label={`${thread.unread} unread`}
                    >
                      {thread.unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
