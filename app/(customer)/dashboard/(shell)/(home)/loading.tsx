import { LoadingAnnouncement, Skeleton } from "@/components/ui/skeleton";
import { Screen } from "@/components/dashboard/ui";

// Streamed placeholder while Home loads. Shaped like Home (the
// greeting, a live card, the upcoming and past lists, and the side column on a
// desktop), so nothing jumps when the content swaps in.

export default function DashboardLoading() {
  return (
    <Screen width="wide">
      <LoadingAnnouncement label="Loading" />

      <div className="pt-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-1.5 h-8 w-44" />
      </div>

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3.5 md:gap-5">
          <Skeleton className="h-[118px] w-full rounded-2xl" />

          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-[70px] w-full rounded-2xl" />
            <Skeleton className="h-[70px] w-full rounded-2xl" />
          </div>

          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-[86px] w-full rounded-2xl" />
            <Skeleton className="h-[86px] w-full rounded-2xl" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-[130px] w-full rounded-2xl" />
          </div>
          <Skeleton className="h-52 w-full rounded-2xl" />
        </div>
      </div>
    </Screen>
  );
}
