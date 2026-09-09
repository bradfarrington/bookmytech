"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { proposeReschedules } from "@/app/actions/mechanic-jobs";

// "Running late?" (Task 38 — Gareth: "work takes longer than planned; the
// mechanic can reschedule his bookings that are booked for later on in the
// day"). Lists today's later jobs that haven't started, pushes them all by
// one tap or one by one, and sends each customer the same proposal they'd
// get from the job page. Each customer accepts or declines from their own
// banner; a decline leaves that job where it was.

export interface LateCandidate {
  bookingId: string;
  title: string;
  /** The booked start, ISO. */
  scheduledAt: string;
  /** "10am–12pm", "All day" or null for a legacy exact time. */
  slotWindow: string | null;
}

interface Row extends LateCandidate {
  include: boolean;
  /** datetime-local value. */
  newLocal: string;
}

const PUSH_OPTIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "3 h", minutes: 180 },
];

const INPUT =
  "h-9 rounded-button border border-border bg-surface-card px-2.5 text-sm text-text-primary focus:border-brand-blue focus:outline-none";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Push from the booked start, or from now if that has already passed — a proposal can't be in the past. */
function pushed(scheduledAt: string, minutes: number): string {
  const base = Math.max(new Date(scheduledAt).getTime(), Date.now());
  const rounded = Math.ceil((base + minutes * 60_000) / (15 * 60_000)) * (15 * 60_000);
  return toLocalInput(new Date(rounded).toISOString());
}

function timeLabel(iso: string, window: string | null): string {
  if (window) return window;
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

export function RunningLate({ jobs }: { jobs: LateCandidate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => jobs.map((j) => ({ ...j, include: true, newLocal: pushed(j.scheduledAt, 60) })));
  const [note, setNote] = useState("Running behind on an earlier job — sorry. Does this new time work for you?");

  if (jobs.length === 0) return null;

  const selected = rows.filter((r) => r.include && r.newLocal);

  function submit() {
    startTransition(async () => {
      const res = await proposeReschedules(
        selected.map((r) => ({ bookingId: r.bookingId, newIso: new Date(r.newLocal).toISOString() })),
        note,
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.proposed > 0) toast.success(`Proposed a new time to ${res.proposed} customer${res.proposed === 1 ? "" : "s"} — they'll accept or decline from their booking.`);
      for (const f of res.failed) {
        const row = rows.find((r) => r.bookingId === f.bookingId);
        toast.error(`${row?.title ?? "One job"}: ${f.error}`);
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card padded={false} id="running-late">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="flex items-center gap-2.5">
          <CalendarClock size={16} className="text-amber-600" />
          <span>
            <span className="block text-[15px] font-bold text-text-primary">Running late?</span>
            <span className="block text-[11px] text-text-muted">
              Move your {jobs.length} later job{jobs.length === 1 ? "" : "s"} today — each customer is asked to accept the new time.
            </span>
          </span>
        </span>
        <ChevronDown size={16} className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-text-muted">Push everything by</span>
            {PUSH_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                type="button"
                onClick={() => setRows((rs) => rs.map((r) => ({ ...r, newLocal: pushed(r.scheduledAt, o.minutes) })))}
                className="rounded-full border border-border bg-surface-card px-3 py-1 text-xs font-semibold text-text-primary hover:border-brand-blue hover:text-brand-blue"
              >
                {o.label}
              </button>
            ))}
            <span className="text-xs text-text-muted">or set each one below.</span>
          </div>

          <ul className="divide-y divide-border-subtle rounded-xl border border-border">
            {rows.map((r) => (
              <li key={r.bookingId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.bookingId === r.bookingId ? { ...x, include: e.target.checked } : x)))}
                  aria-label={`Move ${r.title}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{r.title}</span>
                  <span className="block text-[11px] text-text-muted">Booked {timeLabel(r.scheduledAt, r.slotWindow)}</span>
                </span>
                <label className="flex items-center gap-1.5 text-xs text-text-muted">
                  New time
                  <input
                    type="datetime-local"
                    value={r.newLocal}
                    onChange={(e) => setRows((rs) => rs.map((x) => (x.bookingId === r.bookingId ? { ...x, newLocal: e.target.value } : x)))}
                    aria-label={`New time for ${r.title}`}
                    className={INPUT}
                    disabled={!r.include}
                  />
                </label>
              </li>
            ))}
          </ul>

          <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
            Note to each customer
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} className={`${INPUT} h-auto py-2`} />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" iconLeft={Send} disabled={pending || selected.length === 0} onClick={submit}>
              Propose to {selected.length} customer{selected.length === 1 ? "" : "s"}
            </Button>
            <p className="text-xs text-text-muted">Each job keeps its slot until its customer accepts. A decline leaves it where it was.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
