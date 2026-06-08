"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startStripeOnboarding } from "@/app/actions/stripe-connect";

/**
 * Persistent nudge shown across the mechanic dashboard until payouts are
 * enabled. Dismiss collapses it for the current session (it reappears on a full
 * reload), so a newly-approved mechanic is prompted to connect their bank
 * account without being hard-blocked from looking around first. The online
 * toggle remains gated server-side, so this is a prompt, not the only guard.
 */
export function ConnectStripeBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (dismissed) return null;

  function connect() {
    startTransition(async () => {
      const res = await startStripeOnboarding();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.location.href = res.url;
    });
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between md:mb-6">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 shrink-0 text-warning" size={20} />
        <div>
          <p className="font-bold text-text-primary">
            Connect your bank account to start taking jobs
          </p>
          <p className="mt-0.5 text-sm text-text-muted">
            We verify your details on a secure, hosted page — it takes a couple
            of minutes. You can&apos;t go online until this is done.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button
          variant="primary"
          size="sm"
          iconLeft={pending ? Loader2 : CreditCard}
          onClick={connect}
          disabled={pending}
        >
          {pending ? "Opening…" : "Connect bank account"}
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface hover:text-text-primary"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
