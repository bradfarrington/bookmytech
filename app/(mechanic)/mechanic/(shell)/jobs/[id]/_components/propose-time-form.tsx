"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { proposeReschedule } from "@/app/actions/mechanic-jobs";

// "Propose a new time": a date and time, an optional note, and the button.
// Shared by the job's Actions card and, as "Suggest another time", the card
// for a new time the customer asked for (0092). Either way it is the one
// mechanic proposal (`proposeReschedule`), which the customer accepts or
// declines; on a customer's request it replaces that request.

// Pre-fill the picker in the format a datetime-local input expects (local
// time, no timezone suffix).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProposeTimeForm({
  bookingId,
  initialIso,
  submitLabel = "Propose new time",
  successMessage = "New time proposed. The customer has been notified.",
  help,
  disabled = false,
  onDone,
}: {
  bookingId: string;
  /** What the picker starts on: the booked time, or the time the customer asked for. */
  initialIso: string | null;
  submitLabel?: string;
  successMessage?: string;
  help?: React.ReactNode;
  /** Another action on the page is running. */
  disabled?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTime, setNewTime] = useState(() => toLocalInput(initialIso));
  const [note, setNote] = useState("");

  function submit() {
    if (!newTime) {
      toast.error("Pick a new date and time.");
      return;
    }
    // datetime-local has no timezone: treat the entered value as local time.
    const iso = new Date(newTime).toISOString();
    startTransition(async () => {
      const res = await proposeReschedule(bookingId, iso, note);
      if (res.ok) {
        toast.success(successMessage);
        setNote("");
        onDone?.();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <input
        type="datetime-local"
        value={newTime}
        onChange={(e) => setNewTime(e.target.value)}
        aria-label="New date and time"
        className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-brand-blue focus:outline-none"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional note for the customer"
        className="mt-2 w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
      />
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        disabled={disabled || pending || !newTime}
        onClick={submit}
      >
        {submitLabel}
      </Button>
      {help && <p className="mt-1.5 text-xs text-text-muted">{help}</p>}
    </div>
  );
}
