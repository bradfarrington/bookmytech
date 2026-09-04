import type { SupabaseClient } from "@supabase/supabase-js";
import { REASON_LABELS, type DisputeStatus, type ResolutionKind } from "./constants";

// The mechanic's dispute list (Task 25). Takes whichever Supabase client the
// caller holds — the mechanic pages pass their RLS-aware server client, so
// "Parties read own disputes" (0025) decides what comes back — the same
// pattern as lib/resolutions/load.ts. lib/disputes/load.ts (the detail loader)
// predates this and hardcodes the admin client; it was left alone.
//
// The inner join on bookings.mechanic_id matters: that SELECT policy also
// matches disputes on bookings where the mechanic is the CUSTOMER, and those
// belong on their customer dashboard, not here.

/** Statuses that still need somebody's attention. Same set as the customer list. */
export const OPEN_DISPUTE_STATUSES: readonly DisputeStatus[] = ["opened", "responded", "escalated"];

export interface MechanicDisputeRow {
  id: string;
  status: DisputeStatus;
  openedByRole: "customer" | "mechanic";
  reasonLabel: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: ResolutionKind | null;
  /** Pence refunded to the customer at resolution, when any. */
  refundedPence: number | null;
  bookingId: string;
  jobNumber: number | null;
  repairDescription: string;
  vehicleReg: string | null;
  customerName: string | null;
}

interface RawBooking {
  id: string;
  job_number: number | null;
  repair_description: string | null;
  vehicle_reg: string | null;
  customer_name: string | null;
  mechanic_id: string | null;
}

interface RawDispute {
  id: string;
  status: string;
  opened_by_role: string;
  reason_category: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  resolution_refund_pence: number | null;
  booking: RawBooking | RawBooking[] | null;
}

// One-to-one embeds arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function listMechanicDisputes(
  client: SupabaseClient,
  mechanicId: string,
): Promise<MechanicDisputeRow[]> {
  const { data } = await client
    .from("disputes")
    .select(
      `id, status, opened_by_role, reason_category, created_at, resolved_at, resolution,
       resolution_refund_pence,
       booking:bookings!inner(id, job_number, repair_description, vehicle_reg, customer_name, mechanic_id)`,
    )
    .eq("booking.mechanic_id", mechanicId)
    .order("created_at", { ascending: false });

  const rows: MechanicDisputeRow[] = [];
  for (const d of (data ?? []) as RawDispute[]) {
    const booking = one(d.booking);
    // Belt and braces on top of the join filter.
    if (!booking || booking.mechanic_id !== mechanicId) continue;
    rows.push({
      id: d.id,
      status: d.status as DisputeStatus,
      openedByRole: d.opened_by_role === "mechanic" ? "mechanic" : "customer",
      reasonLabel: REASON_LABELS[d.reason_category] ?? d.reason_category,
      createdAt: d.created_at,
      resolvedAt: d.resolved_at,
      resolution: (d.resolution as ResolutionKind | null) ?? null,
      refundedPence: d.resolution_refund_pence ?? null,
      bookingId: booking.id,
      jobNumber: booking.job_number,
      repairDescription: booking.repair_description ?? "Vehicle repair",
      vehicleReg: booking.vehicle_reg,
      customerName: booking.customer_name,
    });
  }
  return rows;
}

/** The admin list's urgency order inside "open": escalated first, then awaiting the other side, then new. */
const OPEN_PRIORITY: Record<string, number> = { escalated: 0, responded: 1, opened: 2 };

export function isOpenDispute(status: DisputeStatus): boolean {
  return OPEN_DISPUTE_STATUSES.includes(status);
}

/**
 * Open (most urgent first, then newest) and closed (most recently settled
 * first). Pure — unit-tested.
 */
export function groupMechanicDisputes<T extends Pick<MechanicDisputeRow, "status" | "createdAt" | "resolvedAt">>(
  rows: readonly T[],
): { open: T[]; closed: T[] } {
  const stamp = (iso: string | null) => (iso ? Date.parse(iso) : 0);
  const open = rows
    .filter((r) => isOpenDispute(r.status))
    .sort(
      (a, b) =>
        (OPEN_PRIORITY[a.status] ?? 9) - (OPEN_PRIORITY[b.status] ?? 9) ||
        stamp(b.createdAt) - stamp(a.createdAt),
    );
  const closed = rows
    .filter((r) => !isOpenDispute(r.status))
    .sort((a, b) => stamp(b.resolvedAt ?? b.createdAt) - stamp(a.resolvedAt ?? a.createdAt));
  return { open, closed };
}

/**
 * How many of the mechanic's disputes still need attention — the sidebar
 * badge. Never throws: a failed count is 0, not a broken shell.
 */
export async function countOpenMechanicDisputes(
  client: SupabaseClient,
  mechanicId: string,
): Promise<number> {
  try {
    const { count } = await client
      .from("disputes")
      .select("id, booking:bookings!inner(mechanic_id)", { count: "exact", head: true })
      .eq("booking.mechanic_id", mechanicId)
      .in("status", [...OPEN_DISPUTE_STATUSES]);
    return count ?? 0;
  } catch {
    return 0;
  }
}
