"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

// Boundary for the public customer surfaces (landing, help, legal, login,
// signup, review). Catches anything thrown below it and keeps the customer on a
// branded page with a way forward, instead of Next's default error screen.

export default function CustomerError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[customer] unhandled error", error);
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      description="We hit a problem loading this page. Nothing you've done has been lost — try again, and if it keeps happening let us know."
      error={error}
      retry={unstable_retry}
    />
  );
}
