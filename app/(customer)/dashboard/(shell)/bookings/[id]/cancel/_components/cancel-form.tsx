"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Notice } from "@/components/dashboard/ui";
import { cancelBooking } from "@/app/actions/customer-bookings";

// The reason and the two buttons of the cancel screen. `children` (the policy
// table, rendered on the server) sits between the reason and the buttons, as in
// the mockup. The form is `display: contents` so its parts share the screen's
// spacing.

const FIELD =
  "block w-full resize-y rounded-lg border border-border bg-surface-card px-3 py-2.5 text-base leading-5 text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 sm:text-sm";

export function CancelForm({
  bookingId,
  backHref,
  children,
}: {
  bookingId: string;
  backHref: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError("Please tell us why you're cancelling.");
      return;
    }
    startTransition(async () => {
      const res = await cancelBooking(bookingId, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(backHref);
    });
  }

  return (
    <form onSubmit={submit} className="contents">
      <div>
        <label htmlFor="cancel-reason" className="mb-1.5 block text-xs font-semibold text-text-secondary">
          Why are you cancelling?
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example, I've sorted it another way"
          aria-invalid={error === "Please tell us why you're cancelling." || undefined}
          className={FIELD}
        />
      </div>

      {children}

      {error && (
        <div role="alert">
          <Notice tone="danger" title={error} />
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 mt-1 flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 pb-5 pt-3 sm:-mx-6 sm:px-6">
        <Button type="submit" variant="destructive" size="lg" full disabled={pending}>
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </Button>
        <ButtonLink href={backHref} variant="ghost" full>
          Keep my booking
        </ButtonLink>
      </div>
    </form>
  );
}
