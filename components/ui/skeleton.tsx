import { cn } from "@/lib/utils";

// Neutral loading placeholder. One primitive so every loading.tsx pulses at the
// same rate and uses the same greys — mismatched skeletons read as jank rather
// than as loading.
//
// aria-hidden with a sibling live region in each loading.tsx: a screen reader
// should hear "loading", not a description of forty grey rectangles.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-border-subtle", className)}
    />
  );
}

/** Announces the loading state once, for assistive tech. */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}
