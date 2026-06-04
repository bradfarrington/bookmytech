import { Card } from "@/components/ui/card";
import { EarningsRing } from "@/components/mechanic/earnings-ring";
import { formatPrice } from "@/lib/utils";

interface DayViewHeaderProps {
  firstName: string;
  greeting: string; // "Morning" | "Afternoon" | "Evening"
  jobsToday: number;
  bookedTodayPence: number;
  earnedTodayPence: number;
  targetPence: number;
}

// The mechanic's "day at a glance" — greeting, today's workload summary, and a
// progress ring toward the daily earnings goal. Sits at the top of the jobs
// page; reads well from a phone up to the desktop dashboard.
export function DayViewHeader({
  firstName,
  greeting,
  jobsToday,
  bookedTodayPence,
  earnedTodayPence,
  targetPence,
}: DayViewHeaderProps) {
  const jobsLabel =
    jobsToday === 0
      ? "No jobs lined up today"
      : `${jobsToday} job${jobsToday === 1 ? "" : "s"} lined up`;

  return (
    <Card className="flex items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="text-lg font-bold tracking-tight text-text-primary">
          {greeting}, {firstName}.
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {jobsLabel}
          {bookedTodayPence > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-text-primary">
                {formatPrice(bookedTodayPence)}
              </span>{" "}
              booked
            </>
          )}
        </p>
      </div>
      <EarningsRing valuePence={earnedTodayPence} targetPence={targetPence} />
    </Card>
  );
}
