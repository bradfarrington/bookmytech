import {
  Activity,
  ArrowRight,
  Ban,
  BadgePoundSterling,
  CalendarClock,
  CreditCard,
  FilePlus2,
  Landmark,
  MessageSquare,
  Scale,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export interface ActivityEvent {
  id: string;
  bookingRef: string; // short id, e.g. "8ED0549C"
  eventType: string;
  actorRole: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  sourcing_mechanic: "Sourcing",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

type Tone = "active" | "success" | "pending" | "error" | "neutral";

const DOT: Record<Tone, string> = {
  active: "bg-brand-blue",
  success: "bg-success",
  pending: "bg-warning",
  error: "bg-danger",
  neutral: "bg-text-disabled",
};

// Turn a raw booking_event into a human line for the live feed: an icon, a
// short label, and a tone for the leading dot.
function describe(e: ActivityEvent): { icon: LucideIcon; label: string; tone: Tone } {
  const p = e.payload ?? {};
  switch (e.eventType) {
    case "created":
      return { icon: FilePlus2, label: "New booking created", tone: "neutral" };
    case "status_changed": {
      const to = String(p.status_to ?? "");
      const tone: Tone =
        to === "completed"
          ? "success"
          : to === "cancelled"
            ? "neutral"
            : to === "disputed"
              ? "error"
              : ["confirmed", "en_route", "in_progress"].includes(to)
                ? "active"
                : "pending";
      return { icon: ArrowRight, label: `Status → ${STATUS_LABEL[to] ?? to}`, tone };
    }
    case "mechanic_assigned":
      return { icon: UserCheck, label: "Mechanic accepted the job", tone: "active" };
    case "mechanic_reassigned":
      return { icon: UserCheck, label: "Job reassigned to another mechanic", tone: "active" };
    case "reschedule_proposed":
      return { icon: CalendarClock, label: "Reschedule proposed", tone: "pending" };
    case "reschedule_accepted":
      return { icon: CalendarClock, label: "Reschedule accepted", tone: "success" };
    case "reschedule_declined":
      return { icon: CalendarClock, label: "Reschedule declined", tone: "neutral" };
    case "cancelled":
      return { icon: Ban, label: "Booking cancelled", tone: "neutral" };
    case "disputed":
      return { icon: Scale, label: "Dispute opened", tone: "error" };
    case "payment_authorised":
      return { icon: CreditCard, label: "Payment pre-authorised", tone: "neutral" };
    case "payment_captured":
      return { icon: BadgePoundSterling, label: "Payment captured", tone: "success" };
    case "payout_transferred":
      return { icon: Landmark, label: "Mechanic paid out", tone: "success" };
    case "message_sent":
      return { icon: MessageSquare, label: "Message sent", tone: "neutral" };
    case "note":
      return p.kind === "dispatch_stalled"
        ? { icon: TriangleAlert, label: "Dispatch stalled — needs attention", tone: "error" }
        : { icon: Activity, label: "Note added", tone: "neutral" };
    default:
      return { icon: Activity, label: e.eventType, tone: "neutral" };
  }
}

// Relative time, computed at render (the page is force-dynamic and re-fetched on
// each poll, so these stay roughly current).
function ago(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Card padded={false}>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Icon icon={Activity} size={16} className="text-brand-blue" />
        <h2 className="text-[15px] font-bold text-text-primary">Live activity</h2>
        <div className="flex-1" />
        <span className="text-[11px] text-text-muted">Newest first</span>
      </div>

      {events.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">
          No activity yet. Bookings, accepts, payments and payouts will stream in
          here as they happen.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {events.map((e) => {
            const { icon, label, tone } = describe(e);
            return (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`size-2 shrink-0 rounded-full ${DOT[tone]}`} />
                <Icon icon={icon} size={15} className="shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  <span className="font-semibold">{label}</span>
                  {e.actorRole && (
                    <span className="text-text-muted"> · by {e.actorRole}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-text-muted">
                  {e.bookingRef}
                </span>
                <span className="w-16 shrink-0 text-right text-[11px] text-text-muted">
                  {ago(e.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
