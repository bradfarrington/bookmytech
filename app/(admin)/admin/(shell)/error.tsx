"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

// Boundary for the admin shell. Sits inside the shell layout, so the sidebar and
// top bar stay rendered and an admin can navigate away rather than being dumped
// on a bare page.
//
// Staff copy, not customer copy: an admin can act on a digest, so it says so.

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] unhandled error", error);
  }, [error]);

  return (
    <ErrorState
      title="This page failed to load"
      description="Something threw while rendering. The reference below matches the server log entry — that's the fastest way to find the cause."
      error={error}
      retry={unstable_retry}
      homeHref="/admin"
      homeLabel="Admin overview"
    />
  );
}
