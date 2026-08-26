"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

// Boundary for the booking funnel. The highest-stakes one in the app: a customer
// here is partway through giving us their vehicle, address and card.
//
// The copy is deliberate about money. By the time anything can fail after the
// slot step, a pre-authorisation may already be live on their card, and the
// worst thing an error page can do is leave them wondering whether they have
// been charged — so it answers that question before they have to ask it.

export default function BookError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[book] unhandled error in booking funnel", error);
  }, [error]);

  return (
    <ErrorState
      title="We couldn't finish that step"
      description="Something went wrong partway through your booking. You have not been charged — a card is only ever charged once a job is complete. Try again, or get in touch and we'll book it for you."
      error={error}
      retry={unstable_retry}
      homeHref="/book"
      homeLabel="Start again"
    />
  );
}
