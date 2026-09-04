import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/utils";
import { availableCreditPence } from "@/lib/credits/credits";
import { DashboardHeader } from "./_components/dashboard-header";
import { ActiveBookingCard } from "./_components/active-booking-card";
import { UpcomingBookings } from "./_components/upcoming-bookings";
import { PastJobs } from "./_components/past-jobs";
import { SavedVehicles } from "./_components/saved-vehicles";
import { ReferralCard } from "./_components/referral-card";
import { DisputesPanel, type DisputeSummary } from "./_components/disputes-panel";
import { SupportCard } from "./_components/support-card";
import type { DashboardBooking, MechanicLite } from "./_components/types";

// The customer's post-booking home. Middleware guarantees a signed-in customer
// here; we still read via the service-role client (scoped to this user's id +
// email) so we can join the assigned mechanic's profile, which the customer's
// own RLS grant can't see — the same pattern as the guest confirmation page.
export const dynamic = "force-dynamic";

const LIVE = ["en_route", "in_progress"];
const OPEN = ["sourcing_mechanic", "confirmed"];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url, referral_code")
    .eq("id", user.id)
    .single();

  const creditPence = await availableCreditPence(admin, user.id);

  // All of this customer's bookings — linked (customer_id) or guest-by-email.
  const email = user.email ?? "";
  const { data: rows } = await admin
    .from("bookings")
    .select(
      `id, job_number, status, scheduled_at, slot_window, created_at, completed_at, total_pence,
       vehicle_reg, vehicle_make, vehicle_model, address_line_1, postcode,
       mechanic_id, reschedule_status, reschedule_proposed_at, reschedule_note,
       repair_description, repair_node_id`,
    )
    .or(`customer_id.eq.${user.id},customer_email.eq.${email}`)
    .order("scheduled_at", { ascending: false });

  // Job lines of multi-job bookings (Task 24), one query for the lot. An
  // error here (e.g. before migration 0055 exists) just means every booking
  // shows as one job, which is what the booking row itself describes.
  const bookingIds = (rows ?? []).map((b) => b.id as string);
  const linesByBooking = new Map<
    string,
    Array<{ nodeId: string; description: string; itemId: string | null; itemLabel: string | null }>
  >();
  if (bookingIds.length) {
    const { data: lineRows } = await admin
      .from("booking_repairs")
      .select("*")
      .in("booking_id", bookingIds)
      .order("position");
    for (const line of lineRows ?? []) {
      const list = linesByBooking.get(line.booking_id) ?? [];
      list.push({
        nodeId: line.node_id,
        description: line.description ?? "Vehicle repair",
        itemId: line.item_id ?? null,
        itemLabel: line.item_label ?? null,
      });
      linesByBooking.set(line.booking_id, list);
    }
  }
  // "Book again" carries what the customer CHOSE — a combined repair as one
  // id — and the card lists it once by its name.
  const uniq = (values: string[]) => [...new Set(values)];

  const bookings: DashboardBooking[] = (rows ?? []).map((b) => ({
    id: b.id,
    jobNumber: b.job_number ?? null,
    status: b.status,
    scheduledAt: b.scheduled_at,
    slotWindow: b.slot_window,
    createdAt: b.created_at,
    completedAt: b.completed_at,
    totalPence: b.total_pence ?? 0,
    vehicleReg: b.vehicle_reg,
    vehicleMake: b.vehicle_make,
    vehicleModel: b.vehicle_model,
    addressLine1: b.address_line_1,
    postcode: b.postcode,
    mechanicId: b.mechanic_id,
    rescheduleStatus: b.reschedule_status,
    rescheduleProposedAt: b.reschedule_proposed_at,
    rescheduleNote: b.reschedule_note,
    repairDescription: b.repair_description ?? "Vehicle repair",
    repairNodeId: b.repair_node_id ?? null,
    repairNodeIds: linesByBooking.get(b.id)
      ? uniq(linesByBooking.get(b.id)!.map((line) => (line.itemLabel ? line.itemId ?? line.nodeId : line.nodeId)))
      : b.repair_node_id
        ? [b.repair_node_id]
        : [],
    repairLines: linesByBooking.get(b.id)
      ? uniq(linesByBooking.get(b.id)!.map((line) => line.itemLabel ?? line.description))
      : [b.repair_description ?? "Vehicle repair"],
  }));

  // Resolve the assigned mechanics in one round-trip each (profile + rating).
  const mechanicIds = [...new Set(bookings.map((b) => b.mechanicId).filter(Boolean))] as string[];
  const mechanics = new Map<string, MechanicLite>();
  if (mechanicIds.length) {
    const [{ data: profiles }, { data: mechRows }] = await Promise.all([
      admin.from("profiles").select("id, full_name, avatar_url, phone").in("id", mechanicIds),
      admin.from("mechanics").select("id, rating").in("id", mechanicIds),
    ]);
    const ratingById = new Map((mechRows ?? []).map((m) => [m.id, m.rating]));
    for (const p of profiles ?? []) {
      mechanics.set(p.id, {
        id: p.id,
        name: p.full_name ?? "Your mechanic",
        avatarUrl: p.avatar_url ?? null,
        phone: p.phone ?? null,
        rating: ratingById.get(p.id) ?? null,
      });
    }
  }

  // Ratings the customer has already left (to show on past jobs).
  const completedIds = bookings.filter((b) => b.status === "completed").map((b) => b.id);
  const ratedByBooking = new Map<string, number>();
  if (completedIds.length) {
    const { data: reviews } = await admin
      .from("reviews")
      .select("booking_id, rating")
      .in("booking_id", completedIds);
    for (const r of reviews ?? []) ratedByBooking.set(r.booking_id, r.rating);
  }

  // Disputes raised on any of these bookings (so a disputed job stays visible
  // and links to its case instead of vanishing from the list).
  const disputesByBooking: Record<string, { id: string; status: string }> = {};
  // Open cases are also surfaced in their own panel at the top of the page, so
  // fetch what that needs here rather than making a second round-trip for it.
  const openDisputes: DisputeSummary[] = [];
  if (bookings.length) {
    const byId = new Map(bookings.map((b) => [b.id, b]));
    const { data: disputeRows } = await admin
      .from("disputes")
      .select("id, booking_id, status, reason_category, created_at")
      .in("booking_id", bookings.map((b) => b.id))
      .order("created_at", { ascending: false });
    for (const d of disputeRows ?? []) {
      disputesByBooking[d.booking_id] = { id: d.id, status: d.status };
      // "Open" = still waiting on somebody. Resolved and withdrawn cases live on
      // /dashboard/disputes so they don't crowd the jobs that need attention.
      if (["opened", "responded", "escalated"].includes(d.status)) {
        const b = byId.get(d.booking_id);
        openDisputes.push({
          id: d.id,
          status: d.status as DisputeSummary["status"],
          reasonCategory: d.reason_category,
          createdAt: d.created_at,
          jobNumber: b?.jobNumber ?? null,
          repairDescription: b?.repairDescription ?? "Vehicle repair",
        });
      }
    }
  }
  const hasAnyDispute = Object.keys(disputesByBooking).length > 0;

  // Active card: the single most "live" booking — anything en_route/in_progress
  // first, otherwise the soonest still-open (sourcing/confirmed) job.
  const liveOnes = bookings.filter((b) => LIVE.includes(b.status));
  const openFuture = bookings
    .filter((b) => OPEN.includes(b.status))
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  const active = liveOnes[0] ?? openFuture[0] ?? null;

  // Upcoming: open bookings other than the active one (cancel + reschedule).
  const upcoming = bookings.filter(
    (b) => OPEN.includes(b.status) && b.id !== active?.id,
  );

  // Past: completed, cancelled or disputed, newest first. Disputed jobs stay
  // here (they were completed) with a link to the open case.
  const past = bookings
    .filter((b) => ["completed", "cancelled", "disputed"].includes(b.status))
    .sort((a, b) =>
      (b.completedAt ?? b.scheduledAt ?? "").localeCompare(a.completedAt ?? a.scheduledAt ?? ""),
    );

  // Saved vehicles: distinct registrations across all of this customer's bookings.
  const vehicleMap = new Map<string, { reg: string; make: string | null; model: string | null; postcode: string | null }>();
  for (const b of bookings) {
    if (b.vehicleReg && !vehicleMap.has(b.vehicleReg)) {
      vehicleMap.set(b.vehicleReg, {
        reg: b.vehicleReg,
        make: b.vehicleMake,
        model: b.vehicleModel,
        postcode: b.postcode,
      });
    }
  }
  const vehicles = [...vehicleMap.values()];

  const firstName = (profile?.full_name ?? email).split(/[ @]/)[0];

  return (
    <div className="min-h-dvh bg-surface">
      <DashboardHeader name={profile?.full_name ?? email} avatarUrl={profile?.avatar_url ?? null} />

      <main className="mx-auto w-full max-w-content px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Hi {firstName} 👋</h1>
            <p className="text-text-secondary">Here&apos;s everything happening with your bookings.</p>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark"
          >
            <Plus size={16} />
            New booking
          </Link>
        </div>

        {/* Two columns from lg up, one below.
            The single stacked column was fine on a phone and poor on a desktop:
            everything — live job, upcoming, vehicles, history — ran down one
            narrow ribbon, so the thing happening RIGHT NOW sat in the same
            visual rank as a repair from last year.
            Left is what needs attention, in order of urgency. Right is reference
            material that should be reachable without scrolling past the history.
            On mobile the aside falls below the main column, which puts vehicles
            and referral last — exactly where they belong on a small screen. */}
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-10">
          <div className="flex min-w-0 flex-col gap-8">
            {active ? (
              <ActiveBookingCard
                booking={active}
                mechanic={active.mechanicId ? mechanics.get(active.mechanicId) ?? null : null}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface-card p-8 text-center">
                <p className="font-semibold text-text-primary">No active bookings</p>
                <p className="mt-1 text-sm text-text-secondary">
                  When you book a mechanic, you&apos;ll be able to track them here live.
                </p>
                <Link
                  href="/"
                  className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark"
                >
                  Book a mechanic
                </Link>
              </div>
            )}

            <DisputesPanel disputes={openDisputes} />

            {upcoming.length > 0 && (
              <UpcomingBookings bookings={upcoming} mechanics={serialiseMechanics(mechanics)} />
            )}

            <PastJobs
              jobs={past}
              mechanics={serialiseMechanics(mechanics)}
              ratedByBooking={Object.fromEntries(ratedByBooking)}
              disputes={disputesByBooking}
            />
          </div>

          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
            <SavedVehicles vehicles={vehicles} />

            {profile?.referral_code && (
              <ReferralCard
                code={profile.referral_code}
                shareUrl={`${siteUrl()}/signup?ref=${profile.referral_code}`}
                creditPence={creditPence}
              />
            )}

            <SupportCard hasDisputes={hasAnyDispute} />
          </aside>
        </div>
      </main>
    </div>
  );
}

// Map isn't serialisable across the server/client boundary — hand components a
// plain record keyed by mechanic id.
function serialiseMechanics(m: Map<string, MechanicLite>): Record<string, MechanicLite> {
  return Object.fromEntries(m);
}
