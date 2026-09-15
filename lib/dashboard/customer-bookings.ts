import "server-only";

import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";
import { isLiveStatus, isPastStatus, isUpcomingStatus } from "@/lib/bookings/status-meta";
import { formatBookingWhen } from "@/lib/slots";
import { createAdminClient } from "@/lib/supabase/admin";

// A customer's bookings, shaped for the dashboard (Task 48): Home, booking
// detail and the screens under it all read through here.
//
// Service role, scoped to the caller by hand, because a booking card joins
// things a customer's own RLS can't see (the mechanic's profile and rating).
// The scope is the SAME rule as the "Customers can view own bookings" policy
// and `ownsBooking`: their customer_id, or a guest-era booking (no customer_id)
// under their email. The old dashboard matched the email even when the booking
// belonged to someone else's account; this doesn't.
//
// The caller always comes from the cookie session, never a URL.

export interface BookingMechanic {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
  jobCount: number;
  /** Only while the job is live (on the way or in progress), as mechanic_cards. */
  phone: string | null;
}

export interface CustomerBooking {
  id: string;
  jobNumber: number | null;
  status: string;
  scheduledAt: string | null;
  slotWindow: string | null;
  /** The days the customer offered (Task 28), until the mechanic picks one. */
  candidateDays: string[] | null;
  createdAt: string | null;
  completedAt: string | null;
  totalPence: number;
  partsPricePence: number;
  discountPence: number;
  promoCode: string | null;
  paymentMode: string | null;
  vehicleReg: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postcode: string | null;
  parkingType: string | null;
  specialInstructions: string | null;
  mechanicId: string | null;
  mechanic: BookingMechanic | null;
  rescheduleStatus: string | null;
  rescheduleProposedAt: string | null;
  rescheduleNote: string | null;
  /** One line for the whole booking ("X + 2 more jobs" when there are several). */
  repairDescription: string;
  repairNodeId: string | null;
  /** What "Book again" rebooks: every job, a combined repair as one id. */
  repairNodeIds: string[];
  /** Every job's name, in order. */
  repairLines: string[];
  /** A service or inspection checklist was filled in (Task 32): there's a report. */
  hasReport: boolean;
  /** A quote waiting on the customer (Task 33). */
  pendingQuote: { id: string; totalPence: number; kind: "now" | "follow_on"; title: string | null } | null;
  /** A revised job waiting on the customer (Task 37). */
  pendingRevision: { id: string; afterTotalPence: number; differencePence: number; repairDescription: string } | null;
  /** The rating the customer left, once reviewed. */
  rating: number | null;
  dispute: { id: string; status: string } | null;
  /**
   * False for a guest-era booking matched by email (no customer_id). Some
   * flows, such as raising a dispute, only accept bookings linked to the account.
   */
  ownedByAccount: boolean;
  /** "Wed 3 Sep · 8am–10am", or "Any of … · All day" while several days are open. */
  whenLabel: string;
}

const COLUMNS = `id, job_number, status, scheduled_at, slot_window, candidate_days, created_at, completed_at,
  total_pence, parts_price_pence, discount_pence, promo_code, payment_mode,
  vehicle_reg, vehicle_make, vehicle_model, address_line_1, address_line_2, postcode, parking_type,
  special_instructions, mechanic_id, reschedule_status, reschedule_proposed_at, reschedule_note,
  repair_description, repair_node_id, customer_id, customer_email`;

// Before 0063 (discount codes) those two columns don't exist.
const COLUMNS_WITHOUT_DISCOUNTS = COLUMNS.replace("discount_pence, promo_code, ", "");

type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown> & { id: string; customer_id: string | null; customer_email: string | null };

function ownershipFilter(caller: BookingCaller): string | null {
  // A quoted value so an address with a comma or dot can't break the filter.
  return caller.email
    ? `customer_id.eq.${caller.userId},and(customer_id.is.null,customer_email.eq."${caller.email.replace(/"/g, "")}")`
    : null;
}

async function selectBookings(admin: Admin, caller: BookingCaller, bookingId: string | null): Promise<Row[]> {
  const run = async (columns: string) => {
    let query = admin.from("bookings").select(columns);
    const filter = ownershipFilter(caller);
    query = filter ? query.or(filter) : query.eq("customer_id", caller.userId);
    if (bookingId) query = query.eq("id", bookingId);
    return query.order("scheduled_at", { ascending: false, nullsFirst: false });
  };
  let { data, error } = await run(COLUMNS);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data, error } = await run(COLUMNS_WITHOUT_DISCOUNTS));
  }
  if (error) {
    console.error("[dashboard] bookings read failed", caller.userId, error.message);
    throw new Error("We couldn't load your bookings.");
  }
  // Belt and braces: the filter above is the rule, this is the same rule in code.
  return ((data ?? []) as unknown as Row[]).filter((row) => ownsBooking(row, caller));
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

async function hydrate(admin: Admin, rows: Row[]): Promise<CustomerBooking[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const nowIso = new Date().toISOString();

  const [linesRes, quotesRes, revisionsRes, reviewsRes, disputesRes] = await Promise.all([
    admin.from("booking_repairs").select("*").in("booking_id", ids).order("position"),
    admin
      .from("job_quotes")
      .select("id, booking_id, total_pence, kind, title, expires_at")
      .in("booking_id", ids)
      .eq("status", "sent")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false }),
    admin
      .from("job_revisions")
      .select("id, booking_id, after_total_pence, difference_pence, after, expires_at")
      .in("booking_id", ids)
      .eq("status", "sent")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false }),
    admin.from("reviews").select("booking_id, rating").in("booking_id", ids),
    admin.from("disputes").select("id, booking_id, status, created_at").in("booking_id", ids).order("created_at", { ascending: false }),
  ]);

  // Job lines. An error (before 0055) just means every booking reads as one job.
  const lines = new Map<string, Array<{ nodeId: string; description: string; itemId: string | null; itemLabel: string | null }>>();
  for (const line of (linesRes.data ?? []) as Array<Record<string, unknown>>) {
    const bookingId = str(line.booking_id);
    if (!bookingId) continue;
    const list = lines.get(bookingId) ?? [];
    list.push({
      nodeId: str(line.node_id) ?? "",
      description: str(line.description) ?? "Vehicle repair",
      itemId: str(line.item_id),
      itemLabel: str(line.item_label),
    });
    lines.set(bookingId, list);
  }

  // Which bookings have a report: a product line whose product carries a checklist.
  const productIdOf = (nodeId: string | null) => (nodeId && nodeId.startsWith("p:") ? nodeId.slice(2) : null);
  const productIdsByBooking = new Map<string, string[]>();
  for (const row of rows) {
    const nodeIds = lines.get(row.id)?.map((l) => l.nodeId) ?? [str(row.repair_node_id)];
    const productIds = nodeIds.map(productIdOf).filter((v): v is string => v != null);
    if (productIds.length) productIdsByBooking.set(row.id, productIds);
  }
  const withReports = new Set<string>();
  const allProductIds = [...new Set([...productIdsByBooking.values()].flat())];
  if (allProductIds.length) {
    const { data } = await admin.from("catalogue_products").select("id, checklist_id").in("id", allProductIds);
    for (const product of (data ?? []) as Array<{ id: string; checklist_id: string | null }>) {
      if (product.checklist_id) withReports.add(product.id);
    }
  }

  const quotes = new Map<string, CustomerBooking["pendingQuote"]>();
  for (const q of (quotesRes.data ?? []) as Array<Record<string, unknown>>) {
    const bookingId = str(q.booking_id);
    if (bookingId && !quotes.has(bookingId)) {
      quotes.set(bookingId, {
        id: String(q.id),
        totalPence: num(q.total_pence),
        kind: q.kind === "follow_on" ? "follow_on" : "now",
        title: str(q.title),
      });
    }
  }

  const revisions = new Map<string, CustomerBooking["pendingRevision"]>();
  for (const r of (revisionsRes.data ?? []) as Array<Record<string, unknown>>) {
    const bookingId = str(r.booking_id);
    if (bookingId && !revisions.has(bookingId)) {
      const after = (r.after ?? {}) as { repairDescription?: string };
      revisions.set(bookingId, {
        id: String(r.id),
        afterTotalPence: num(r.after_total_pence),
        differencePence: num(r.difference_pence),
        repairDescription: after.repairDescription ?? "Revised job",
      });
    }
  }

  const ratings = new Map<string, number>();
  for (const review of (reviewsRes.data ?? []) as Array<{ booking_id: string; rating: number }>) {
    ratings.set(review.booking_id, review.rating);
  }

  const disputes = new Map<string, { id: string; status: string }>();
  for (const d of (disputesRes.data ?? []) as Array<{ id: string; booking_id: string; status: string }>) {
    if (!disputes.has(d.booking_id)) disputes.set(d.booking_id, { id: d.id, status: d.status });
  }

  // The assigned mechanics, one round-trip each for profile and stats.
  const mechanicIds = [...new Set(rows.map((row) => str(row.mechanic_id)).filter((v): v is string => !!v))];
  const mechanics = new Map<string, Omit<BookingMechanic, "phone"> & { phoneOnFile: string | null }>();
  if (mechanicIds.length) {
    const [{ data: profiles }, { data: stats }] = await Promise.all([
      admin.from("profiles").select("id, full_name, avatar_url, phone").in("id", mechanicIds),
      admin.from("mechanics").select("id, rating, job_count").in("id", mechanicIds),
    ]);
    const statsById = new Map(
      ((stats ?? []) as Array<{ id: string; rating: number | string | null; job_count: number | null }>).map((m) => [m.id, m]),
    );
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; phone: string | null }>) {
      const s = statsById.get(p.id);
      const rating = s?.rating == null ? null : Number(s.rating);
      mechanics.set(p.id, {
        id: p.id,
        name: p.full_name?.trim() || "Your mechanic",
        avatarUrl: p.avatar_url,
        rating: rating != null && Number.isFinite(rating) ? rating : null,
        jobCount: s?.job_count ?? 0,
        phoneOnFile: p.phone,
      });
    }
  }

  const uniq = (values: string[]) => [...new Set(values)];

  return rows.map((row) => {
    const status = str(row.status) ?? "sourcing_mechanic";
    const bookingLines = lines.get(row.id);
    const mechanicId = str(row.mechanic_id);
    const m = mechanicId ? mechanics.get(mechanicId) : undefined;
    return {
      id: row.id,
      jobNumber: row.job_number == null ? null : num(row.job_number),
      status,
      scheduledAt: str(row.scheduled_at),
      slotWindow: str(row.slot_window),
      candidateDays: Array.isArray(row.candidate_days) ? (row.candidate_days as string[]) : null,
      createdAt: str(row.created_at),
      completedAt: str(row.completed_at),
      totalPence: num(row.total_pence),
      partsPricePence: num(row.parts_price_pence),
      discountPence: num(row.discount_pence),
      promoCode: str(row.promo_code),
      paymentMode: str(row.payment_mode),
      vehicleReg: str(row.vehicle_reg) ?? "",
      vehicleMake: str(row.vehicle_make),
      vehicleModel: str(row.vehicle_model),
      addressLine1: str(row.address_line_1),
      addressLine2: str(row.address_line_2),
      postcode: str(row.postcode),
      parkingType: str(row.parking_type),
      specialInstructions: str(row.special_instructions),
      mechanicId,
      mechanic: m
        ? {
            id: m.id,
            name: m.name,
            avatarUrl: m.avatarUrl,
            rating: m.rating,
            jobCount: m.jobCount,
            phone: isLiveStatus(status) ? m.phoneOnFile : null,
          }
        : null,
      rescheduleStatus: str(row.reschedule_status),
      rescheduleProposedAt: str(row.reschedule_proposed_at),
      rescheduleNote: str(row.reschedule_note),
      repairDescription: str(row.repair_description) ?? "Vehicle repair",
      repairNodeId: str(row.repair_node_id),
      repairNodeIds: bookingLines
        ? uniq(bookingLines.map((line) => (line.itemLabel ? (line.itemId ?? line.nodeId) : line.nodeId)))
        : str(row.repair_node_id)
          ? [str(row.repair_node_id)!]
          : [],
      repairLines: bookingLines
        ? uniq(bookingLines.map((line) => line.itemLabel ?? line.description))
        : [str(row.repair_description) ?? "Vehicle repair"],
      hasReport: (productIdsByBooking.get(row.id) ?? []).some((id) => withReports.has(id)),
      pendingQuote: quotes.get(row.id) ?? null,
      pendingRevision: revisions.get(row.id) ?? null,
      rating: ratings.get(row.id) ?? null,
      dispute: disputes.get(row.id) ?? null,
      ownedByAccount: row.customer_id != null,
      whenLabel: formatBookingWhen({
        scheduled_at: str(row.scheduled_at),
        slot_window: str(row.slot_window),
        candidate_days: Array.isArray(row.candidate_days) ? (row.candidate_days as string[]) : null,
      }),
    };
  });
}

/** Every booking the caller owns, newest slot first. */
export async function loadCustomerBookings(caller: BookingCaller): Promise<CustomerBooking[]> {
  const admin = createAdminClient();
  return hydrate(admin, await selectBookings(admin, caller, null));
}

/** One of the caller's bookings, or null when it isn't theirs or doesn't exist. */
export async function loadCustomerBooking(caller: BookingCaller, bookingId: string): Promise<CustomerBooking | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const admin = createAdminClient();
  const [booking] = await hydrate(admin, await selectBookings(admin, caller, bookingId));
  return booking ?? null;
}

/** Home's three groups: live now, coming up (soonest first), and past (newest first). */
export function groupCustomerBookings(bookings: CustomerBooking[]) {
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  return {
    live: bookings.filter((b) => isLiveStatus(b.status)),
    upcoming: bookings
      .filter((b) => isUpcomingStatus(b.status))
      .sort((a, b) => time(a.scheduledAt) - time(b.scheduledAt)),
    past: bookings
      .filter((b) => isPastStatus(b.status))
      .sort((a, b) => time(b.completedAt ?? b.scheduledAt) - time(a.completedAt ?? a.scheduledAt)),
  };
}

/** "Ford Focus", or the registration when DVLA gave no make. */
export function vehicleName(booking: Pick<CustomerBooking, "vehicleMake" | "vehicleModel" | "vehicleReg">): string {
  const name = [booking.vehicleMake, booking.vehicleModel]
    .filter(Boolean)
    .map((part) => part!.charAt(0) + part!.slice(1).toLowerCase())
    .join(" ");
  return name || booking.vehicleReg;
}
