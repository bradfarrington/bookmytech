import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DisputeDetailData } from "@/components/disputes/dispute-detail";
import type { DisputeStatus, ResolutionKind } from "@/lib/disputes/constants";
import { formatJobNumber } from "@/lib/utils";

export interface LoadedDispute {
  data: DisputeDetailData;
  viewerRole: "customer" | "mechanic" | "admin";
  isOpener: boolean;
  bookingId: string;
}

// Load a dispute for whoever's viewing it, resolving their role from the booking
// (admin / customer / mechanic). Returns null if the dispute doesn't exist or
// the viewer isn't a party — callers redirect on null.
export async function loadDispute(disputeId: string, userId: string): Promise<LoadedDispute | null> {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("disputes")
    .select(
      `id, booking_id, opened_by, opened_by_role, reason_category, description, photos,
       refund_requested_pence, status, created_at, resolution, resolution_note,
       resolution_refund_pence, resolution_credit_pence`,
    )
    .eq("id", disputeId)
    .maybeSingle();
  if (!d) return null;

  const { data: b } = await admin
    .from("bookings")
    .select("id, job_number, customer_id, mechanic_id, repair_description")
    .eq("id", d.booking_id)
    .single();
  if (!b) return null;

  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
  const viewerRole: "customer" | "mechanic" | "admin" | null =
    profile?.role === "admin"
      ? "admin"
      : b.customer_id === userId
        ? "customer"
        : b.mechanic_id === userId
          ? "mechanic"
          : null;
  if (!viewerRole) return null;

  const serviceName =
    (b as { repair_description: string | null }).repair_description ?? "Vehicle repair";

  const data: DisputeDetailData = {
    disputeId: d.id,
    status: d.status as DisputeStatus,
    serviceName,
    ref: formatJobNumber((b as { job_number: number | null }).job_number),
    reasonCategory: d.reason_category,
    description: d.description,
    photos: d.photos ?? [],
    refundRequestedPence: d.refund_requested_pence,
    openedByRole: d.opened_by_role as "customer" | "mechanic",
    createdAt: d.created_at,
    resolution: (d.resolution as ResolutionKind | null) ?? null,
    resolutionNote: d.resolution_note,
    resolutionRefundPence: d.resolution_refund_pence,
    resolutionCreditPence: d.resolution_credit_pence,
  };

  return { data, viewerRole, isOpener: d.opened_by === userId, bookingId: d.booking_id };
}
