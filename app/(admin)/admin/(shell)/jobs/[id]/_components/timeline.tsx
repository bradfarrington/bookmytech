import {
  CircleDot,
  UserPlus,
  Repeat,
  XCircle,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  StickyNote,
  ArrowRightLeft,
  CalendarClock,
  Flag,
  type LucideIcon,
} from "lucide-react";

export interface TimelineEvent {
  id: string;
  eventType: string;
  actorRole: string | null;
  reason: string | null;
  createdAt: string;
  /**
   * `payload.kind` of a 'note' event, which some features use to say what the
   * note is (0092: 'cancellation_requested', 'cancellation_request_dismissed').
   */
  noteKind?: string | null;
  /** `payload.by`: who made a change (0092: 'customer' on a mechanic_reassigned = they chose another mechanic). */
  payloadBy?: string | null;
}

const META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  created: { label: "Booking created", icon: CircleDot, tone: "text-brand-blue" },
  status_changed: { label: "Status changed", icon: ArrowRightLeft, tone: "text-text-muted" },
  mechanic_assigned: { label: "Mechanic assigned", icon: UserPlus, tone: "text-green-600" },
  mechanic_reassigned: { label: "Mechanic reassigned", icon: Repeat, tone: "text-amber-600" },
  cancelled: { label: "Booking cancelled", icon: XCircle, tone: "text-red-600" },
  disputed: { label: "Flagged as disputed", icon: AlertTriangle, tone: "text-red-600" },
  payment_authorised: { label: "Payment pre-authorised", icon: CreditCard, tone: "text-brand-blue" },
  payment_captured: { label: "Payment captured", icon: CheckCircle2, tone: "text-green-600" },
  arrival_window_set: { label: "Arrival window set", icon: CalendarClock, tone: "text-brand-blue" },
  reschedule_proposed: { label: "New time proposed", icon: CalendarClock, tone: "text-amber-600" },
  reschedule_accepted: { label: "New time accepted", icon: CalendarClock, tone: "text-green-600" },
  reschedule_declined: { label: "New time declined", icon: CalendarClock, tone: "text-text-muted" },
  // 0092: a customer's new time on a confirmed booking is a request the mechanic answers.
  reschedule_requested: { label: "Customer asked for a new time", icon: CalendarClock, tone: "text-amber-600" },
  reschedule_withdrawn: { label: "Customer withdrew their new time", icon: CalendarClock, tone: "text-text-muted" },
  // Task 33
  fault_added: { label: "Fault noted", icon: AlertTriangle, tone: "text-amber-600" },
  quote_sent: { label: "Quote sent", icon: CreditCard, tone: "text-brand-blue" },
  quote_approved: { label: "Quote approved", icon: CheckCircle2, tone: "text-green-600" },
  quote_declined: { label: "Quote declined", icon: XCircle, tone: "text-text-muted" },
  quote_withdrawn: { label: "Quote withdrawn", icon: XCircle, tone: "text-text-muted" },
  quote_expired: { label: "Quote expired", icon: XCircle, tone: "text-text-muted" },
  // Task 37
  revision_sent: { label: "Revised job sent", icon: ArrowRightLeft, tone: "text-brand-blue" },
  revision_approved: { label: "Revised job approved", icon: CheckCircle2, tone: "text-green-600" },
  revision_declined: { label: "Revised job declined", icon: XCircle, tone: "text-amber-600" },
  revision_withdrawn: { label: "Revised job withdrawn", icon: XCircle, tone: "text-text-muted" },
  revision_expired: { label: "Revised job expired", icon: XCircle, tone: "text-text-muted" },
  payment_refunded: { label: "Payment refunded", icon: CreditCard, tone: "text-red-600" },
  payout_transferred: { label: "Payout transferred", icon: CheckCircle2, tone: "text-green-600" },
  note: { label: "Note", icon: StickyNote, tone: "text-text-muted" },
};

/** 0092: the customer turned down their mechanic's new time and had the job offered to others. */
const CUSTOMER_REASSIGNED = { label: "Customer chose another mechanic", icon: Repeat, tone: "text-amber-600" };

/** Notes that mean something specific, by `payload.kind`. */
const NOTE_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  cancellation_requested: { label: "Customer asked us to cancel", icon: Flag, tone: "text-amber-600" },
  cancellation_request_dismissed: { label: "Cancellation request dismissed", icon: Flag, tone: "text-text-muted" },
};

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No events recorded yet. Actions you take below will be logged here.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {events.map((e, i) => {
        const meta = (e.eventType === "note" && e.noteKind ? NOTE_META[e.noteKind] : undefined) ??
          (e.eventType === "mechanic_reassigned" && e.payloadBy === "customer" ? CUSTOMER_REASSIGNED : undefined) ??
          META[e.eventType] ?? {
          label: e.eventType,
          icon: CircleDot,
          tone: "text-text-muted",
        };
        const Icon = meta.icon;
        const isLast = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden />
            )}
            <span className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-border">
              <Icon size={13} className={meta.tone} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-semibold text-text-primary">{meta.label}</p>
                <time className="text-xs text-text-muted">{formatStamp(e.createdAt)}</time>
              </div>
              <p className="text-xs text-text-muted">
                {e.actorRole ? `by ${e.actorRole}` : "system"}
              </p>
              {e.reason && (
                <p className="mt-1 rounded-lg bg-surface px-3 py-2 text-sm text-text-secondary">
                  {e.reason}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
