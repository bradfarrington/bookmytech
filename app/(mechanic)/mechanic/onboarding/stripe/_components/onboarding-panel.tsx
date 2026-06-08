"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startStripeOnboarding, refreshStripeStatus } from "@/app/actions/stripe-connect";

interface Props {
  hasAccount: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  justReturned: boolean;
}

export function StripeOnboardingPanel({
  hasAccount,
  payoutsEnabled,
  onboardingComplete,
  justReturned,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(justReturned);
  const synced = useRef(false);

  // When the mechanic lands back from Stripe (?return=1), re-sync the flags so
  // the page reflects their new status without waiting for the webhook.
  useEffect(() => {
    if (!justReturned || synced.current) return;
    synced.current = true;
    refreshStripeStatus().then((res) => {
      setSyncing(false);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }, [justReturned, router]);

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

  function recheck() {
    setSyncing(true);
    refreshStripeStatus().then((res) => {
      setSyncing(false);
      if (res.ok) {
        router.refresh();
        toast.success(res.payoutsEnabled ? "Payouts enabled." : "Still pending with Stripe.");
      } else {
        toast.error(res.error);
      }
    });
  }

  if (payoutsEnabled) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={22} />
          <div>
            <p className="font-bold text-text-primary">You&apos;re all set</p>
            <p className="mt-1 text-sm text-text-muted">
              Your bank account is connected and payouts are enabled. Your share of
              each completed job is transferred to you on Stripe&apos;s standard
              schedule.
            </p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => router.push("/mechanic/jobs")}
            >
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-6">
      {syncing ? (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="animate-spin" size={16} /> Checking your payout status…
        </p>
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            {hasAccount && onboardingComplete
              ? "We have your details but payouts aren't enabled yet — this can take a few minutes. Re-check below."
              : hasAccount
                ? "You started onboarding but haven't finished. Pick up where you left off."
                : "We securely collect your bank details and verify your identity on a secure hosted page. It takes a couple of minutes."}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="primary"
              iconLeft={pending ? Loader2 : CreditCard}
              onClick={connect}
              disabled={pending}
            >
              {pending
                ? "Opening…"
                : hasAccount
                  ? "Continue onboarding"
                  : "Connect bank account"}
            </Button>
            {hasAccount && (
              <Button variant="secondary" iconLeft={RefreshCw} onClick={recheck} disabled={syncing}>
                Re-check status
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
