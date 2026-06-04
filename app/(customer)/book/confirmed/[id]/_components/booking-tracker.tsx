import Link from "next/link";
import { Check, Clock, Navigation, Wrench, PartyPopper, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BookingMechanic {
  name: string;
  avatarUrl: string | null;
  rating: number | null;
}

interface BookingTrackerProps {
  bookingId: string;
  status: string;
  mechanic: BookingMechanic | null;
}

// The happy-path lifecycle, in order. cancelled / disputed are handled outside
// the stepper. en_route_at / started_at / completed_at on the booking back these
// transitions — we only need the current status to render progress.
const STEPS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "sourcing_mechanic", label: "Booked", icon: Check },
  { key: "confirmed", label: "Mechanic confirmed", icon: Check },
  { key: "en_route", label: "On the way", icon: Navigation },
  { key: "in_progress", label: "Work in progress", icon: Wrench },
  { key: "completed", label: "Complete", icon: PartyPopper },
];

const ORDER = STEPS.map((s) => s.key);

const BANNERS: Record<string, { title: string; body: string; icon: LucideIcon }> = {
  sourcing_mechanic: {
    title: "Finding your mechanic",
    body: "We're matching you with the best available mechanic in your area. You'll get an email as soon as one accepts — usually within minutes.",
    icon: Clock,
  },
  confirmed: {
    title: "Your mechanic is confirmed",
    body: "You're all booked in. We'll let you know the moment your mechanic sets off.",
    icon: Check,
  },
  en_route: {
    title: "Your mechanic is on the way",
    body: "Your mechanic has set off and is heading to you now. Please make sure your vehicle is accessible.",
    icon: Navigation,
  },
  in_progress: {
    title: "Work in progress",
    body: "Your mechanic is on site and working on your vehicle. You'll be asked to sign off once it's done.",
    icon: Wrench,
  },
  completed: {
    title: "Job complete",
    body: "All done — your payment has been taken and a receipt is on its way to your inbox. Thanks for using Book My Tech.",
    icon: PartyPopper,
  },
};

export function BookingTracker({ bookingId, status, mechanic }: BookingTrackerProps) {
  if (status === "cancelled") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-700">This booking was cancelled</p>
        <p className="mt-1 text-sm text-red-600 leading-relaxed">
          No money has left your account. If this is unexpected, get in touch and
          we&apos;ll sort it out.
        </p>
      </div>
    );
  }

  if (status === "disputed") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="font-semibold text-amber-800">This booking is under review</p>
        <p className="mt-1 text-sm text-amber-700 leading-relaxed">
          Our team is looking into this booking and will be in touch shortly.
        </p>
      </div>
    );
  }

  const currentIndex = ORDER.indexOf(status);
  const banner = BANNERS[status] ?? BANNERS.sourcing_mechanic;
  const live = status === "en_route" || status === "in_progress";

  return (
    <div className="flex flex-col gap-5">
      {/* Status banner */}
      <div
        className={
          status === "completed"
            ? "rounded-2xl border border-green-200 bg-green-50 p-5"
            : "rounded-2xl border border-brand-blue/20 bg-blue-50 p-5"
        }
      >
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 shrink-0">
            <banner.icon
              size={20}
              className={status === "completed" ? "text-success" : "text-brand-blue"}
            />
            {live && (
              <>
                <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-ping rounded-full bg-brand-blue opacity-75" />
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand-blue" />
              </>
            )}
          </div>
          <div>
            <p
              className={
                status === "completed"
                  ? "font-semibold text-success"
                  : "font-semibold text-brand-blue"
              }
            >
              {banner.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{banner.body}</p>
            {status === "completed" && (
              <Link
                href={`/review/${bookingId}`}
                className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark"
              >
                <Star size={15} className="fill-white" />
                Rate your mechanic
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mechanic card — revealed once a mechanic has accepted */}
      {mechanic && currentIndex >= ORDER.indexOf("confirmed") && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-card p-4">
          {mechanic.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mechanic.avatarUrl}
              alt={mechanic.name}
              className="size-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-base font-bold text-brand-blue">
              {mechanic.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Your mechanic
            </p>
            <p className="truncate font-semibold text-text-primary">{mechanic.name}</p>
            {mechanic.rating != null && mechanic.rating > 0 && (
              <p className="flex items-center gap-1 text-sm text-text-secondary">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                {mechanic.rating.toFixed(1)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step rail */}
      <ol className="flex flex-col gap-0">
        {STEPS.map((step, i) => {
          const done = currentIndex > i;
          const active = currentIndex === i;
          const isLast = i === STEPS.length - 1;
          return (
            <li key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={[
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    done
                      ? "border-success bg-success text-white"
                      : active
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-border bg-surface-card text-text-muted",
                  ].join(" ")}
                >
                  {done ? <Check size={16} /> : <step.icon size={15} />}
                </div>
                {!isLast && (
                  <div
                    className={`my-1 w-0.5 grow ${done ? "bg-success" : "bg-border"}`}
                    style={{ minHeight: 20 }}
                  />
                )}
              </div>
              <div className={`pb-5 pt-1 ${isLast ? "pb-0" : ""}`}>
                <p
                  className={[
                    "text-sm font-semibold",
                    done || active ? "text-text-primary" : "text-text-muted",
                  ].join(" ")}
                >
                  {step.label}
                </p>
                {active && (
                  <p className="text-xs text-brand-blue">In progress now</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
