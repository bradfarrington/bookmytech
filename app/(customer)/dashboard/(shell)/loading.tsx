import { LoadingAnnouncement, Skeleton } from "@/components/ui/skeleton";
import { Screen } from "@/components/dashboard/ui";

// Streamed placeholder while a dashboard screen loads: a screen header and a
// few cards, the shape most screens share. Home has its own (in (home)/).

export default function DashboardScreenLoading() {
  return (
    <Screen>
      <LoadingAnnouncement label="Loading" />
      <div className="flex min-h-14 items-center">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-[140px] w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[70px] w-full rounded-2xl" />
      </div>
    </Screen>
  );
}
