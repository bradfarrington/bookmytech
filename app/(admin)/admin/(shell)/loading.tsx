import { LoadingAnnouncement, Skeleton } from "@/components/ui/skeleton";

// Streamed placeholder for every admin page. Sits inside the shell layout, so
// the sidebar and top bar stay put and only the panel swaps — which is what
// makes navigating between admin pages feel instant rather than blank.
//
// Generic on purpose: admin pages are overwhelmingly "heading, filters, table",
// so one placeholder fits them all without pretending to know row counts.

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading" />

      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2.5 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
        <Skeleton className="h-11 w-full rounded-none" />
        <div className="flex flex-col gap-px bg-border-subtle">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
