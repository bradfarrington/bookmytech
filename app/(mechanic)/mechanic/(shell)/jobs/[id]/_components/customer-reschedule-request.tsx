"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { acceptCustomerReschedule } from "@/app/actions/mechanic-jobs";
import { ProposeTimeForm } from "./propose-time-form";

// A new time the customer asked for on this confirmed job (0092). The booking
// keeps its time until the mechanic answers, and there are two answers:
// accept (the job moves), or suggest another time (the ordinary mechanic
// proposal, which replaces the request and which the customer then answers).
// There is no plain "no": if the asked-for time doesn't work, the mechanic
// says which time does.
export function CustomerRescheduleRequest({
  bookingId,
  requestedIso,
  requestedLabel,
  currentLabel,
  note,
}: {
  bookingId: string;
  requestedIso: string;
  /** "Wed 2 Dec · 2pm–4pm" */
  requestedLabel: string;
  /** The job's booked time, which it keeps unless this is accepted. */
  currentLabel: string;
  note: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggesting, setSuggesting] = useState(false);

  function accept() {
    startTransition(async () => {
      const res = await acceptCustomerReschedule(bookingId);
      if (res.ok) {
        toast.success(`Accepted. The job is now ${requestedLabel}, and the customer has been told.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <CalendarClock size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">New time requested</p>
          <h2 className="mt-1 text-base font-bold text-amber-900">
            The customer asked to move this job to {requestedLabel}
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            It&apos;s booked for <strong>{currentLabel}</strong> and stays there until you accept. If that time
            doesn&apos;t work for you, suggest one that does.
          </p>
          {note && (
            <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-sm text-amber-800">&ldquo;{note}&rdquo;</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" iconLeft={Check} disabled={pending} onClick={accept}>
              Accept new time
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              aria-expanded={suggesting}
              onClick={() => setSuggesting((open) => !open)}
            >
              Suggest another time
            </Button>
          </div>

          {suggesting && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3.5">
              <ProposeTimeForm
                bookingId={bookingId}
                initialIso={requestedIso}
                submitLabel="Suggest this time"
                successMessage="Another time suggested. The customer has been notified."
                disabled={pending}
                onDone={() => setSuggesting(false)}
                help="This replaces the customer's request. They can accept your time, keep their original one, or have it offered to another mechanic."
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
