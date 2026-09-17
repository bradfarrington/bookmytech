import "server-only";
import { repairLinesFor, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import { resultsForKind, type ChecklistKind, type ChecklistTier } from "@/lib/checklists/checklists";
import { loadBookingChecklists, productIdsInLines, type LoadedChecklist } from "@/lib/checklists/load";
import { geocodePostcode, haversineMiles, type LatLng } from "@/lib/geo/postcodes";
import { CANCEL_REASONS } from "@/lib/mechanics/cancel-reasons";
import { jobMoney, type JobMoney } from "@/lib/mechanics/job-money";
import { completionGate } from "@/lib/mechanics/job-progress";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";
import { roundMiles } from "@/lib/mechanics/today";
import { createAdminClient } from "@/lib/supabase/admin";

// What the mechanic app's job screen cannot assemble from its own RLS reads
// (GET /api/mobile/v1/mechanic/bookings/[id]/job, Task 67):
//
//   • where the job IS, as coordinates — the app has the postcode, not a geocoder;
//   • the money, from the same sum as the website's job page (./job-money.ts);
//   • the checklists — `catalogue_products` is admin-only, so which checklist a
//     booking carries takes the service role to work out;
//   • what would stop "Complete" right now, in completeAndChargeFor's own words.
//
// Everything else on the screen — the booking row, repairs, events, photos,
// parts, quotes, messages — the app reads itself.

export interface JobChecklistView {
  key: string;
  /** "Full service" / "Pre-purchase inspection · Gold" — as the refusal sentences name it. */
  name: string;
  kind: ChecklistKind;
  tier: ChecklistTier | null;
  /** The answers an item can take, in display order. Labels are the app's. */
  answers: string[];
  sections: Array<{
    name: string;
    items: Array<{ id: string; label: string; result: string | null; comment: string | null }>;
  }>;
  progress: ChecklistProgressView;
}

export interface ChecklistProgressView {
  answered: number;
  total: number;
  advisories: number;
  fails: number;
}

export interface JobView {
  destination: LatLng | null;
  /** Straight line from the mechanic's base, one decimal. Null when either end won't geocode. */
  distanceMiles: number | null;
  money: JobMoney;
  checklists: JobChecklistView[];
  completeBlocker: string | null;
  cancelReasons: string[];
}

export type JobViewResult = ({ ok: true } & JobView) | MechanicRefusal;

export function progressView(progress: LoadedChecklist["progress"]): ChecklistProgressView {
  return {
    answered: progress.answered,
    total: progress.total,
    advisories: progress.advisory,
    fails: progress.fail,
  };
}

function checklistView(list: LoadedChecklist): JobChecklistView {
  const byItem = new Map(list.results.map((r) => [r.item_id, r]));
  return {
    key: list.checklist.key,
    name: list.name,
    kind: list.checklist.kind,
    tier: list.tier,
    answers: resultsForKind(list.checklist.kind).map((r) => r.value),
    sections: list.sections.map((s) => ({
      name: s.section,
      items: s.items.map((i) => ({
        id: i.id,
        label: i.label,
        result: byItem.get(i.id)?.result ?? null,
        comment: byItem.get(i.id)?.comment ?? null,
      })),
    })),
    progress: progressView(list.progress),
  };
}

export async function jobViewFor(mechanicId: string, bookingId: string): Promise<JobViewResult> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, status, mechanic_id, postcode, mileage, repair_node_id, repair_description,
       total_pence, commission_rate, platform_fee_pence, credit_applied_pence, discount_pence`,
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return refuse("not_found", "That job no longer exists.");
  if (booking.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your job.");

  const [{ data: mechanic }, { data: parts }, { data: lineRows }] = await Promise.all([
    admin.from("mechanics").select("base_postcode").eq("id", mechanicId).maybeSingle(),
    admin.from("booking_parts").select("total_pence, sourcing").eq("booking_id", bookingId),
    admin.from("booking_repairs").select("*").eq("booking_id", bookingId).order("position"),
  ]);

  const lines = repairLinesFor(booking, (lineRows ?? null) as BookingRepairRow[] | null);
  const [destination, base, checklists] = await Promise.all([
    geocodePostcode(booking.postcode),
    geocodePostcode(mechanic?.base_postcode),
    loadBookingChecklists(admin, bookingId, productIdsInLines(lines)),
  ]);
  const gate = await completionGate(admin, bookingId, booking.mileage, checklists);

  return {
    ok: true,
    destination,
    distanceMiles: base && destination ? roundMiles(haversineMiles(base, destination)) : null,
    money: jobMoney(booking, parts ?? []),
    checklists: checklists.map(checklistView),
    completeBlocker: gate.blocker,
    cancelReasons: CANCEL_REASONS.map((r) => r.value),
  };
}
