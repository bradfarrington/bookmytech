import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface ScheduleItem {
  bookingId: string;
  time: string; // "12:00"
  title: string; // "Brake pads · VW Golf"
  where: string; // "Peckham SE15"
  earnings: string; // formatted "£89" or ""
  status: "confirmed" | "en_route" | "in_progress" | "completed" | "cancelled" | "disputed";
  isNext: boolean;
}

const DOT: Record<ScheduleItem["status"], string> = {
  completed: "bg-success",
  in_progress: "bg-brand-blue",
  en_route: "bg-brand-blue",
  confirmed: "bg-text-disabled",
  cancelled: "bg-text-disabled",
  disputed: "bg-warning",
};

export function Schedule({ items }: { items: ScheduleItem[] }) {
  const bookedTotal = items.length;

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <h2 className="text-[15px] font-bold text-text-primary">Your day</h2>
        <span className="text-[11px] text-text-muted">
          {bookedTotal} confirmed job{bookedTotal === 1 ? "" : "s"} today
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-border-subtle">
            <Icon icon={CalendarClock} size={22} className="text-text-muted" />
          </div>
          <p className="text-sm font-semibold text-text-primary">
            Nothing booked today
          </p>
          <p className="max-w-xs text-xs text-text-muted">
            Accepted jobs scheduled for today will show up here as a running
            timeline.
          </p>
        </div>
      ) : (
        <div className="px-5 py-3">
          {items.map((item, i) => (
            <Link
              key={item.bookingId}
              href={`/mechanic/jobs/${item.bookingId}`}
              className="flex items-center gap-3.5 border-b border-border-subtle py-3 last:border-b-0 transition-colors hover:bg-surface"
            >
              <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-text-muted">
                {item.time}
              </span>
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  DOT[item.status],
                  item.status === "in_progress" && "animate-pulse",
                )}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    item.isNext
                      ? "font-bold text-text-primary"
                      : "font-medium text-text-primary",
                  )}
                >
                  {item.title}
                </span>
                <span className="block truncate text-[11px] text-text-muted">
                  {item.where}
                </span>
              </span>
              {item.isNext && <Pill tone="active">Next up</Pill>}
              {item.status === "completed" && <Pill tone="success">Done</Pill>}
              {item.earnings && (
                <span className="w-14 shrink-0 text-right text-sm font-bold text-text-primary">
                  {item.earnings}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
