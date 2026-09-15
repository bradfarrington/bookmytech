import Link from "next/link";
import { AlertTriangle, ChevronRight, FileText } from "lucide-react";
import type { CustomerBooking } from "@/lib/dashboard/customer-bookings";
import { formatPrice } from "@/lib/utils";
import { Caption, Panel, Tile } from "@/components/dashboard/ui";
import { mechanicFirstName, proposedTimeLabel, type WaitingItem } from "./booking-logic";
import { RescheduleCard } from "./reschedule-card";

// The cards for things only the customer can move on: a quote to approve, a
// revised job to approve, a new time to answer. Home lists them across every
// booking (with `showJob`); the booking detail shows its own.

function differenceText(differencePence: number): string {
  if (differencePence > 0) return `${formatPrice(differencePence)} more`;
  if (differencePence < 0) return `${formatPrice(-differencePence)} less`;
  return "Same price";
}

function LinkCard({
  href,
  tone,
  icon,
  title,
  caption,
  job,
}: {
  href: string;
  tone: "tint" | "warn";
  icon: React.ReactNode;
  title: string;
  caption: string;
  job?: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
    >
      <Panel
        tone={tone}
        className={tone === "warn" ? "transition-colors group-hover:border-amber-300" : "transition-colors group-hover:border-blue-200"}
      >
        <div className="flex items-center gap-3">
          {icon}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-[21px] text-text-primary">{title}</div>
            <div className="mt-0.5 text-xs leading-4 text-text-secondary">{caption}</div>
            {job && <Caption className="mt-1">{job}</Caption>}
          </div>
          <ChevronRight
            size={18}
            aria-hidden
            className={tone === "warn" ? "shrink-0 text-amber-700" : "shrink-0 text-brand-blue"}
          />
        </div>
      </Panel>
    </Link>
  );
}

export function WaitingCard({
  item,
  showJob = false,
}: {
  item: WaitingItem<CustomerBooking>;
  showJob?: boolean;
}) {
  const { booking } = item;
  const who = mechanicFirstName(booking.mechanic?.name);
  const job = showJob ? booking.repairDescription : undefined;

  if (item.kind === "revision") {
    return (
      <LinkCard
        href={`/dashboard/revisions/${item.revision.id}`}
        tone="warn"
        icon={<Tile icon={AlertTriangle} tone="warn" />}
        title="Revised job waiting"
        caption={`${differenceText(item.revision.differencePence)} · ${item.revision.repairDescription}. Nothing changes until you approve.`}
        job={job}
      />
    );
  }

  if (item.kind === "quote") {
    const what = item.quote.title ?? (item.quote.kind === "follow_on" ? "a return visit" : "extra work");
    return (
      <LinkCard
        href={`/dashboard/quotes/${item.quote.id}`}
        tone="tint"
        icon={<Tile icon={FileText} className="bg-white" />}
        title={`Quote waiting · ${formatPrice(item.quote.totalPence)}`}
        caption={`${who} has quoted for ${what}. Nothing is charged until you approve.`}
        job={job}
      />
    );
  }

  return (
    <RescheduleCard
      bookingId={booking.id}
      mechanicName={who}
      proposedLabel={proposedTimeLabel(item.proposedAt)}
      currentLabel={booking.whenLabel}
      note={booking.rescheduleNote}
      job={job}
    />
  );
}
