import Link from "next/link";
import { Phone } from "lucide-react";
import { vehicleName, type CustomerBooking } from "@/lib/dashboard/customer-bookings";
import { formatPrice } from "@/lib/utils";
import { AvatarTile, buttonClass, Caption, LiveDot, Panel } from "@/components/dashboard/ui";
import { mechanicFirstName, telHref } from "./booking-logic";

// Home's hero for a job happening now (mockup 02 "Dashboard · Live booking").
// The mockup's illustrated map and "12 min away" are left out: there's no ETA
// to show. The whole card opens the booking; Call sits above that link.
export function LiveHero({ booking }: { booking: CustomerBooking }) {
  const mechanic = booking.mechanic;
  const who = mechanicFirstName(mechanic?.name);
  const stage = booking.status === "en_route" ? "On the way" : "Work in progress";

  return (
    <Panel tone="live" padding="none" className="relative transition-shadow hover:shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
      <div className="flex items-center gap-2 bg-surface-dark px-4 py-2.5">
        <LiveDot />
        <span className="truncate text-xs font-bold uppercase leading-4 tracking-[0.1em] text-white/65">
          {who} · {stage}
        </span>
      </div>
      <div className="flex items-center gap-3 p-3.5">
        <AvatarTile name={mechanic?.name ?? "Mechanic"} src={mechanic?.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="text-sm font-bold leading-[21px] text-text-primary after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-blue"
          >
            {booking.repairDescription}
          </Link>
          <Caption className="mt-0.5">
            {vehicleName(booking)} · {formatPrice(booking.totalPence)}
          </Caption>
        </div>
        {mechanic?.phone && (
          <a
            href={telHref(mechanic.phone)}
            aria-label={`Call ${who}`}
            className={buttonClass({ size: "sm", className: "relative z-10" })}
          >
            <Phone size={14} strokeWidth={2.2} aria-hidden />
            Call
          </a>
        )}
      </div>
    </Panel>
  );
}
