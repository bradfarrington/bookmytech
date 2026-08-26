import { LoadingAnnouncement, Skeleton } from "@/components/ui/skeleton";

// Streamed placeholder for the mechanic shell. Mechanics are usually on a phone
// on mobile data, so this is the surface where a blank wait is felt most — the
// shell chrome stays and only the content area swaps.

export default function MechanicLoading() {
  return (
    <div className="space-y-5">
      <LoadingAnnouncement label="Loading" />

      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
