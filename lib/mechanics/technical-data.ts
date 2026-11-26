import "server-only";
import { isHaynesProConfigured } from "@/lib/haynespro/client";
import {
  getAdjustments,
  getCapacities,
  getIdLocations,
  getStory,
  getStoryList,
} from "@/lib/haynespro/tree";
import type { HpAdjustment, HpStoryLine } from "@/lib/haynespro/types";
import { resolveVehicle } from "@/lib/haynespro/vehicle";
import { ownedBooking } from "@/lib/mechanics/owned-booking";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";

// The repair manuals and technical data for a job's vehicle, for the mechanic
// app (Task 86) — the mobile twin of /mechanic/jobs/[id]/technical (Task 27),
// which renders the same HaynesPro reads as server components.
//
// The HaynesPro payloads are mapped to small shapes of our own rather than
// passed through: a shipped response is a contract with every installed app,
// and HaynesPro's field names (V6, V7, …) change with their API versions.

/** One line of a manual or an ID-location: text, a picture, and lines under it. */
export interface TechnicalStoryLine {
  name: string | null;
  text: string | null;
  remark: string | null;
  /** Absolute image URL on haynespro-assets.com (JPEG or SVGZ), or null. */
  imageUrl: string | null;
  lines: TechnicalStoryLine[];
}

/** A specification row; a row with `rows` is a heading over them. */
export interface TechnicalDataRow {
  name: string | null;
  value: string | null;
  unit: string | null;
  remark: string | null;
  rows: TechnicalDataRow[];
}

export interface TechnicalManualSummary {
  storyId: number;
  name: string;
}

function mapLine(line: HpStoryLine): TechnicalStoryLine {
  return {
    name: line.name ?? null,
    text: line.paragraphContent ?? null,
    remark: line.remark ?? null,
    imageUrl: line.mimeData?.mimeDataName ?? null,
    lines: (line.subStoryLines ?? []).map(mapLine),
  };
}

function mapRow(row: HpAdjustment): TechnicalDataRow {
  return {
    name: row.name ?? null,
    value: row.value ?? null,
    unit: row.unit ?? null,
    remark: row.remark ?? null,
    rows: (row.subAdjustments ?? []).map(mapRow),
  };
}

/**
 * The booking's car as HaynesPro knows it, after checking the job is this
 * mechanic's. `carTypeId: null` means there is nothing to show for it — no
 * HaynesPro configured, no reg, or a reg that didn't resolve — which the app
 * explains rather than treating as an error.
 */
async function jobCarType(
  mechanicId: string,
  bookingId: string,
): Promise<
  { ok: true; carTypeId: number | null; vehicle: string | null } | MechanicRefusal
> {
  const owned = await ownedBooking(bookingId, mechanicId);
  if (!owned.ok) return owned;

  const { data: booking } = await owned.admin
    .from("bookings")
    .select("vehicle_reg")
    .eq("id", bookingId)
    .single();
  if (!booking) return refuse("not_found", "That job no longer exists.");

  if (!isHaynesProConfigured() || !booking.vehicle_reg) {
    return { ok: true, carTypeId: null, vehicle: null };
  }
  // Same reg → car type resolution the funnel priced the job with (cached per reg).
  const resolved = await resolveVehicle(booking.vehicle_reg, owned.admin);
  return {
    ok: true,
    carTypeId: resolved?.carTypeId ?? null,
    vehicle: resolved?.description ?? null,
  };
}

export async function jobManualsFor(mechanicId: string, bookingId: string) {
  const car = await jobCarType(mechanicId, bookingId);
  if (!car.ok) return car;
  if (car.carTypeId == null) {
    return { ok: true as const, matched: false, vehicle: null, manuals: [] as TechnicalManualSummary[] };
  }

  const stories = await getStoryList(car.carTypeId);
  return {
    ok: true as const,
    matched: true,
    vehicle: car.vehicle,
    manuals: stories
      .filter((s): s is typeof s & { storyId: number } => typeof s.storyId === "number")
      .map((s) => ({ storyId: s.storyId, name: s.name ?? "Untitled manual" })),
  };
}

export async function jobManualFor(mechanicId: string, bookingId: string, storyId: number) {
  const car = await jobCarType(mechanicId, bookingId);
  if (!car.ok) return car;
  if (car.carTypeId == null) {
    return refuse("not_found", "We couldn't match this vehicle to the manufacturer data.");
  }

  const story = await getStory(car.carTypeId, storyId);
  if (!story) return refuse("not_found", "Couldn't load this manual.");
  return {
    ok: true as const,
    name: story.name ?? "Repair manual",
    lines: (story.storyLines ?? []).map(mapLine),
  };
}

export async function jobTechnicalDataFor(mechanicId: string, bookingId: string) {
  const car = await jobCarType(mechanicId, bookingId);
  if (!car.ok) return car;
  if (car.carTypeId == null) {
    return {
      ok: true as const,
      matched: false,
      vehicle: null,
      adjustments: [] as TechnicalDataRow[],
      capacities: [] as TechnicalDataRow[],
      idLocations: [] as TechnicalStoryLine[][],
    };
  }

  const [adjustments, capacities, idLocations] = await Promise.all([
    getAdjustments(car.carTypeId),
    getCapacities(car.carTypeId),
    getIdLocations(car.carTypeId),
  ]);
  return {
    ok: true as const,
    matched: true,
    vehicle: car.vehicle,
    // A group per top-level adjustment, as the website's collapsible list.
    adjustments: adjustments.map(mapRow),
    // getCapacities wraps one root; the website shows its children flat.
    capacities: capacities.flatMap((group) => (group.subAdjustments ?? []).map(mapRow)),
    // One list of lines per ID location (each is its own card on the website).
    idLocations: idLocations.map((loc) => (loc.storyLines ?? []).map(mapLine)),
  };
}
