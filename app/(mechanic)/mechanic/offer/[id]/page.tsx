import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { geocodePostcode, haversineMiles, type LatLng } from "@/lib/geo/postcodes";
import { mechanicSharePence } from "@/lib/earnings";
import { OfferScreen } from "./_components/offer-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function slotLabel(iso: string | null): string {
  if (!iso) return "Time to be confirmed";
  const when = new Date(iso);
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const whenDay = new Date(when);
  whenDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((whenDay.getTime() - today.getTime()) / 86_400_000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  return `${when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

// Minimal full-screen chrome — this route lives outside the (shell) group on
// purpose, so the offer is a focused decision screen with no sidebar/top-bar.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface pt-[env(safe-area-inset-top)]">
      {children}
    </div>
  );
}

export default async function OfferPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS ("Mechanics can view own offers", 0008) scopes this to the caller's
  // offers; anything else returns no row.
  const { data: offer } = await supabase
    .from("job_offers")
    .select(
      `id, response, mechanic_id, offered_at,
       booking:bookings(id, vehicle_reg, vehicle_make, vehicle_model, area, postcode,
         scheduled_at, total_pence, commission_rate, special_instructions,
         service:services(name))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!offer || offer.mechanic_id !== user.id) notFound();

  const booking = one(offer.booking as never) as
    | {
        id: string;
        vehicle_reg: string | null;
        vehicle_make: string | null;
        vehicle_model: string | null;
        area: string | null;
        postcode: string | null;
        scheduled_at: string | null;
        total_pence: number | null;
        commission_rate: number | null;
        special_instructions: string | null;
        service: unknown;
      }
    | null;
  if (!booking) notFound();

  // Offer already resolved (this mechanic responded, or someone else accepted
  // and it was superseded) → the job's no longer up for grabs.
  if (offer.response !== null) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-border-subtle">
            <CheckCircle2 size={30} className="text-text-muted" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">This job&apos;s no longer available</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {offer.response === "accepted"
                ? "You accepted this job."
                : "Another mechanic accepted it first, or it was withdrawn."}
            </p>
          </div>
          <Link
            href="/mechanic/jobs"
            className="inline-flex h-11 items-center rounded-button bg-brand-blue px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark"
          >
            Back to jobs
          </Link>
        </div>
      </Shell>
    );
  }

  // Distance from the mechanic's base to the job.
  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("base_postcode")
    .eq("id", user.id)
    .single();

  let distanceLabel: string | null = null;
  if (mechanic?.base_postcode && booking.postcode) {
    const base: LatLng | null = await geocodePostcode(mechanic.base_postcode);
    const job: LatLng | null = await geocodePostcode(booking.postcode);
    if (base && job) distanceLabel = `${haversineMiles(base, job).toFixed(1)} mi`;
  }

  const service = one(booking.service as never) as { name?: string } | null;

  return (
    <Shell>
      <header className="flex h-14 items-center gap-2 px-4">
        <Link
          href="/mechanic/jobs"
          aria-label="Back to jobs"
          className="flex size-10 items-center justify-center rounded-button text-text-secondary transition-colors hover:bg-border-subtle"
        >
          <ArrowLeft size={20} />
        </Link>
        <span className="text-sm font-semibold text-text-muted">New job offer</span>
      </header>

      <OfferScreen
        offerId={offer.id}
        bookingId={booking.id}
        mechanicId={user.id}
        serviceName={service?.name ?? "Service"}
        vehicle={[booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" ") || "Vehicle"}
        reg={booking.vehicle_reg}
        whenLabel={slotLabel(booking.scheduled_at)}
        where={booking.area ?? booking.postcode ?? "—"}
        distanceLabel={distanceLabel}
        notes={booking.special_instructions}
        earningsPence={mechanicSharePence(booking.total_pence ?? 0, booking.commission_rate ?? 0.15)}
      />
    </Shell>
  );
}
