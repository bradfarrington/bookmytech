import { LoadingAnnouncement, Skeleton } from "@/components/ui/skeleton";

// Streamed placeholder for the customer dashboard. The page is force-dynamic and
// makes several round-trips (bookings, mechanic profiles, credit balance), so
// without this the customer stares at the previous page until all of them land.
//
// The shapes mirror the real layout — header, active booking card, then the
// upcoming/past lists — so nothing jumps when the content swaps in.

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-surface">
      <LoadingAnnouncement label="Loading your bookings" />

      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Skeleton className="h-8 w-[120px]" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />

        {/* Active booking card */}
        <Skeleton className="mt-7 h-44 w-full rounded-2xl" />

        {/* Upcoming */}
        <Skeleton className="mt-9 h-5 w-40" />
        <div className="mt-3 flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>

        {/* Past jobs */}
        <Skeleton className="mt-9 h-5 w-32" />
        <div className="mt-3 flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
