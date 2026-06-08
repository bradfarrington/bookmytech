import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodePostcode, haversineMiles, type LatLng } from "@/lib/geo/postcodes";
import { mechanicSharePence } from "@/lib/earnings";
import { estimatedDurationLabel } from "@/lib/jobs/estimates";
import { JobDetail, type JobDetailProps } from "./_components/job-detail";
import type { TimelineEvent } from "@/app/(admin)/admin/(shell)/jobs/[id]/_components/timeline";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const REVEAL_PHONE_STATUSES = ["en_route", "in_progress"];

export default async function MechanicJobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to bookings the mechanic is assigned to OR holds an offer
  // for (policies in 0008). Anything else returns no row → notFound.
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, status, mechanic_id, scheduled_at, created_at, total_pence, commission_rate,
       platform_fee_pence, mechanic_payout_pence,
       vehicle_reg, vehicle_make, vehicle_model, postcode, area,
       address_line_1, address_line_2,
       customer_name, customer_phone, special_instructions,
       cancellation_reason, reschedule_status, reschedule_proposed_at,
       service:services(name, slug)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!booking) notFound();

  const service = one(booking.service as never) as { name?: string; slug?: string } | null;

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("base_postcode, service_radius_miles, specialisms, rating")
    .eq("id", user.id)
    .single();

  // --- Distance (mechanic base → job) --------------------------------------
  const radiusMiles = mechanic?.service_radius_miles ?? 10;
  let distanceMiles: number | null = null;
  if (mechanic?.base_postcode && booking.postcode) {
    const base: LatLng | null = await geocodePostcode(mechanic.base_postcode);
    const job: LatLng | null = await geocodePostcode(booking.postcode);
    if (base && job) distanceMiles = haversineMiles(base, job);
  }
  const distanceLabel = distanceMiles != null ? `${distanceMiles.toFixed(1)} mi` : "—";

  // --- Timeline (assigned jobs only; offered-but-unassigned have no access) -
  const { data: eventRows } = await supabase
    .from("booking_events")
    .select("id, event_type, actor_role, reason, created_at")
    .eq("booking_id", id)
    .order("created_at", { ascending: true });

  const events: TimelineEvent[] = (eventRows ?? []).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    actorRole: e.actor_role,
    reason: e.reason,
    createdAt: e.created_at,
  }));

  // --- Job evidence (mechanic photos + sign-off signature) -----------------
  const { data: mediaRows } = await supabase
    .from("booking_media")
    .select("id, kind, storage_path, created_at")
    .eq("booking_id", id)
    .order("created_at", { ascending: true });

  const publicUrl = (path: string) =>
    supabase.storage.from("job-media").getPublicUrl(path).data.publicUrl;

  const photos = (mediaRows ?? [])
    .filter((m) => m.kind === "photo")
    .map((m) => ({ id: m.id, url: publicUrl(m.storage_path) }));
  const signatureRow = (mediaRows ?? []).find((m) => m.kind === "signature");
  const signatureUrl = signatureRow ? publicUrl(signatureRow.storage_path) : null;

  // --- Parts on this job (mechanic reads via RLS; only BMT-price columns) ----
  const { data: partRows } = await supabase
    .from("booking_parts")
    .select("id, part_name, quantity, unit_price_pence, total_pence, sourcing, status")
    .eq("booking_id", id)
    .order("created_at", { ascending: true });

  const jobParts = (partRows ?? []).map((p) => ({
    id: p.id,
    name: p.part_name,
    quantity: p.quantity,
    unitPricePence: p.unit_price_pence,
    totalPence: p.total_pence,
    sourcing: (p.sourcing === "bmt" ? "bmt" : "self") as "self" | "bmt",
    status: p.status,
  }));
  const partsPence = jobParts.reduce((s, p) => s + p.totalPence, 0);
  const bmtPartsPence = jobParts
    .filter((p) => p.sourcing === "bmt")
    .reduce((s, p) => s + p.totalPence, 0);

  // --- Match reasons --------------------------------------------------------
  const specialisms: string[] = Array.isArray(mechanic?.specialisms) ? mechanic.specialisms : [];
  const slug = service?.slug ?? null;
  const rating = mechanic?.rating ?? 0;

  const matchReasons: Array<{ label: string; detail: string }> = [];
  if (distanceMiles != null) {
    matchReasons.push({
      label: "Close to you",
      detail: `${distanceMiles.toFixed(1)} mi from your base — inside your ${radiusMiles}-mile area`,
    });
  } else {
    matchReasons.push({
      label: "In your service area",
      detail: `Within your ${radiusMiles}-mile coverage`,
    });
  }
  if (slug && specialisms.includes(slug)) {
    matchReasons.push({
      label: "Specialism match",
      detail: `${service?.name ?? "This service"} is one of your declared specialisms`,
    });
  } else if (specialisms.length === 0) {
    matchReasons.push({
      label: "Open to all services",
      detail: "You haven't restricted to specific specialisms",
    });
  }
  matchReasons.push(
    rating > 0
      ? { label: "Strong rating", detail: `Your ${rating.toFixed(1)}★ customer rating` }
      : { label: "Building your rating", detail: "New mechanics are matched on proximity + availability" },
  );

  // --- Dispute on this job (if any) — mechanic reads via RLS ---------------
  const { data: disputeRow } = await supabase
    .from("disputes")
    .select("id")
    .eq("booking_id", id)
    .maybeSingle();

  const whenLabel = booking.scheduled_at
    ? new Date(booking.scheduled_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "To be confirmed";

  const address =
    [booking.address_line_1, booking.address_line_2, booking.postcode].filter(Boolean).join(", ") || "—";

  const detail: JobDetailProps = {
    bookingId: booking.id,
    status: booking.status,
    shortRef: booking.id.slice(0, 8).toUpperCase(),
    createdAt: booking.created_at,
    serviceName: service?.name ?? "Service",
    vehicle: [booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" ") || "Vehicle",
    reg: booking.vehicle_reg,
    whenLabel,
    distanceLabel,
    durationLabel: estimatedDurationLabel(slug),
    earningsPence:
      mechanicSharePence(booking.total_pence ?? 0, booking.commission_rate ?? 0.15) -
      bmtPartsPence,
    customerName: booking.customer_name ?? "",
    customerPhone: booking.customer_phone,
    phoneRevealed: REVEAL_PHONE_STATUSES.includes(booking.status),
    specialInstructions: booking.special_instructions,
    address,
    totalPence: booking.total_pence ?? 0,
    commissionRate: booking.commission_rate ?? 0.15,
    parts: jobParts,
    partsPence,
    bmtPartsPence,
    matchReasons,
    cancellationReason: booking.cancellation_reason,
    rescheduleStatus: booking.reschedule_status,
    rescheduleProposedAt: booking.reschedule_proposed_at,
    scheduledAt: booking.scheduled_at,
    events,
    photos,
    signatureUrl,
    hasSignature: signatureUrl != null,
    disputeId: disputeRow?.id ?? null,
  };

  return <JobDetail {...detail} />;
}
