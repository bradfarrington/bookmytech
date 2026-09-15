"use client";

import { useRouter } from "next/navigation";
import { useStayFresh } from "@/lib/use-stay-fresh";

// Re-runs the server component on an interval while the tab is visible, and
// whenever the customer comes back to the tab, so a job moving on (a mechanic
// accepts, sets off, finishes) shows without a manual reload. Rendered only
// while there's something that can change on its own.
export function AutoRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useStayFresh(() => router.refresh(), intervalMs);
  return null;
}
