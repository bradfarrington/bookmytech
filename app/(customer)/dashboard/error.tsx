"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

// Boundary for the signed-in customer dashboard.

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
    <ErrorState
      title="We couldn't load your account"
      description="Your bookings are safe — this is a problem displaying them, not with the jobs themselves. Try again in a moment."
      error={error}
      retry={unstable_retry}
      homeHref="/dashboard"
      homeLabel="Back to dashboard"
    />
  );
}
