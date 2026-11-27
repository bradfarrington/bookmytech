// The car's equipment, as the customer tells us (Task 87).
//
// NAPA lists some parts in two versions, for cars with and without air-con or
// stop-start, and nothing we look up says what a car has. So the customer is
// asked, only when it changes a part ("Does your car have air conditioning?
// Yes / No / Not sure"). The answer:
//   • travels with the website funnel in the URL, `ac` and `ss`: "y", "n" or
//     "u" (Not sure). Not personal, like the reg and the jobs;
//   • comes from the apps in the body: `equipment: { airCon, stopStart }`,
//     each true, false or null (Not sure). Absent = not asked;
//   • is kept on the booking (bookings.car_air_con / car_stop_start) and the
//     customer's saved car (customer_vehicles.air_con / stop_start, migration
//     0093), so a signed-in customer is asked once per car.
//
// An answer given now wins over the saved car's, "Not sure" included.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CarEquipment } from "@/lib/parts/quote-parts";
import type { EquipmentKey } from "@/lib/parts/repair-part-choice";

export type EquipmentAnswer = "y" | "n" | "u";

/** What the customer is asked, verbatim. The apps show it as sent. */
export const EQUIPMENT_QUESTION: Record<EquipmentKey, string> = {
  air_con: "Does your car have air conditioning?",
  stop_start: "Does your car have stop-start? (The engine switches off by itself when you stop in traffic.)",
};

/** Why we ask, under the question. */
export const EQUIPMENT_WHY = "It changes which part your car needs. If you're not sure, your mechanic will check.";

/** A URL value as an answer: "y", "n" or "u". Anything else: not answered. Pure. */
export function readEquipmentAnswer(value: string | null | undefined): EquipmentAnswer | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "y" || v === "n" || v === "u" ? v : null;
}

/** An answer as the pricing reads it: yes true, no false, Not sure null. Pure. */
export function answerValue(answer: EquipmentAnswer): boolean | null {
  return answer === "y" ? true : answer === "n" ? false : null;
}

/** A value as a URL answer. Pure. */
export function answerOf(value: boolean | null): EquipmentAnswer {
  return value === true ? "y" : value === false ? "n" : "u";
}

/**
 * The answers in a funnel URL. A key is present only when the customer
 * answered, so a saved car's answer can fill the rest. Pure.
 */
export function equipmentFromParams(params: { ac?: string | null; ss?: string | null }): CarEquipment {
  const out: CarEquipment = {};
  const ac = readEquipmentAnswer(params.ac);
  const ss = readEquipmentAnswer(params.ss);
  if (ac) out.airCon = answerValue(ac);
  if (ss) out.stopStart = answerValue(ss);
  return out;
}

/**
 * The answers in an app's request body (`equipment: { airCon, stopStart }`).
 * true / false / null are answers (null: Not sure); anything else, or absent,
 * is not. Pure.
 */
export function equipmentFromBody(raw: unknown): CarEquipment {
  if (!raw || typeof raw !== "object") return {};
  const body = raw as Record<string, unknown>;
  const out: CarEquipment = {};
  for (const key of ["airCon", "stopStart"] as const) {
    const v = body[key];
    if (v === true || v === false || v === null) out[key] = v;
  }
  return out;
}

/** The answers given now, with the saved car's for any not given. Pure. */
export function mergeEquipment(given: CarEquipment, saved: CarEquipment | null | undefined): CarEquipment {
  return {
    airCon: "airCon" in given ? (given.airCon ?? null) : (saved?.airCon ?? null),
    stopStart: "stopStart" in given ? (given.stopStart ?? null) : (saved?.stopStart ?? null),
  };
}

function isMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find .* column/i.test(error.message ?? "");
}

function normaliseReg(reg: string): string {
  return reg.replace(/\s+/g, "").toUpperCase();
}

/** The saved car's answers, or none. Never throws; nothing before migration 0093. */
export async function savedCarEquipment(db: SupabaseClient, customerId: string | null, reg: string): Promise<CarEquipment> {
  if (!customerId || !reg.trim()) return {};
  try {
    const { data, error } = await db
      .from("customer_vehicles")
      .select("air_con, stop_start")
      .eq("customer_id", customerId)
      .eq("registration", normaliseReg(reg))
      .maybeSingle();
    if (error || !data) return {};
    const row = data as { air_con: boolean | null; stop_start: boolean | null };
    const out: CarEquipment = {};
    if (row.air_con != null) out.airCon = row.air_con;
    if (row.stop_start != null) out.stopStart = row.stop_start;
    return out;
  } catch {
    return {};
  }
}

/**
 * Keep the customer's yes / no on their saved car, after a booking. "Not
 * sure" never clears an earlier yes or no. Never throws; the car is already
 * in the garage (recordBookedVehicle).
 */
export async function rememberCarEquipment(
  db: SupabaseClient,
  customerId: string | null,
  reg: string,
  equipment: CarEquipment | null | undefined,
): Promise<void> {
  if (!customerId || !reg.trim() || !equipment) return;
  const patch: Record<string, boolean> = {};
  if (equipment.airCon != null) patch.air_con = equipment.airCon;
  if (equipment.stopStart != null) patch.stop_start = equipment.stopStart;
  if (Object.keys(patch).length === 0) return;
  try {
    const { error } = await db
      .from("customer_vehicles")
      .update(patch)
      .eq("customer_id", customerId)
      .eq("registration", normaliseReg(reg));
    if (error && !isMissing(error)) console.error("[garage] remember car equipment failed", customerId, error.message);
  } catch (err) {
    console.error("[garage] remember car equipment failed", customerId, err);
  }
}

/** A booking's answers, for pricing the mechanic's extra work on it. Never throws; none before 0093. */
export async function bookingCarEquipment(db: SupabaseClient, bookingId: string): Promise<CarEquipment> {
  try {
    const { data, error } = await db.from("bookings").select("car_air_con, car_stop_start").eq("id", bookingId).maybeSingle();
    if (error || !data) return {};
    const row = data as { car_air_con: boolean | null; car_stop_start: boolean | null };
    return { airCon: row.car_air_con, stopStart: row.car_stop_start };
  } catch {
    return {};
  }
}

/** The booking columns for a quote's answers. Only the ones answered, so a booking before 0093 is unaffected. Pure. */
export function bookingEquipmentColumns(equipment: CarEquipment | null | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (equipment?.airCon != null) out.car_air_con = equipment.airCon;
  if (equipment?.stopStart != null) out.car_stop_start = equipment.stopStart;
  return out;
}

/** The questions as the apps receive them: what to ask, in the customer's words. Pure. */
export function equipmentQuestionsForApp(keys: readonly EquipmentKey[] | undefined): Array<{ key: EquipmentKey; question: string; why: string }> {
  return (keys ?? []).map((key) => ({ key, question: EQUIPMENT_QUESTION[key], why: EQUIPMENT_WHY }));
}
