"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

// Boundary for the mechanic shell.
//
// Mechanics hit this on a phone, often mid-job and often on bad signal, so the
// copy leads with the thing they actually need to know: a job they have already
// updated is not affected by this screen failing to render.

export default function MechanicError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[mechanic] unhandled error", error);
  }, [error]);

  return (
    <ErrorState
      title="This screen didn't load"
      description="Any job updates you've already saved are safe. This is usually a patchy connection — try again, and if it persists your jobs list should still work."
      error={error}
      retry={unstable_retry}
      homeHref="/mechanic/jobs"
      homeLabel="Back to jobs"
    />
  );
}
