"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, ButtonLink, Panel, Screen } from "@/components/dashboard/ui";

// Boundary for the signed-in customer dashboard, in the dashboard's own look.
// `digest` is the handle on the server log entry (production strips the real
// message), so it's shown for a support conversation.

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] unhandled error", error);
  }, [error]);

  return (
    <Screen className="pt-8">
      <Panel tone="float" padding="lg" className="text-center">
        <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-3xl bg-red-50 text-danger">
          <AlertTriangle size={36} strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="font-display text-lg font-bold tracking-[-0.3px] text-text-primary">
          We couldn&apos;t load this page
        </h1>
        <p className="mt-2 text-sm leading-[21px] text-text-secondary">
          Your bookings are safe. This is a problem showing them, not with the jobs themselves. Please try again in a
          moment.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button icon={RotateCw} onClick={() => unstable_retry()}>
            Try again
          </Button>
          <ButtonLink href="/dashboard" variant="ghost">
            Back to Home
          </ButtonLink>
        </div>
        <p className="mt-5 text-xs leading-4 text-text-muted">
          Still stuck? Email{" "}
          <a href="mailto:support@bookmytech.co.uk" className="font-semibold text-brand-blue hover:text-brand-blue-dark">
            support@bookmytech.co.uk
          </a>
        </p>
        {error.digest && <p className="mt-2 text-[11px] leading-4 text-text-muted">Reference: {error.digest}</p>}
      </Panel>
    </Screen>
  );
}
