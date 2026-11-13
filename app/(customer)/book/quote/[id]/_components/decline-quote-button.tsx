"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declineCustomQuoteAction } from "@/app/actions/custom-quotes";

/** Decline a custom quote, or cancel a request still being priced (Task 75). Asks once. */
export function DeclineQuoteButton({ quoteId, pricing }: { quoteId: string; pricing: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = pricing ? "Cancel my request" : "Decline this quote";

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-center text-sm font-semibold text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-4 text-center">
      <p className="text-sm text-text-primary">
        {pricing ? "Cancel your request? We'll stop pricing it." : "Decline this quote? You won't be able to book it afterwards."}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await declineCustomQuoteAction(quoteId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            })
          }
          className="rounded-button bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? "One moment…" : label}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-button border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface"
        >
          Keep it
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
