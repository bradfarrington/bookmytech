import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";
import type { VehicleDetails } from "@/lib/dvla/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/supabase/errors";
import { detailsStale, formatRegistration, isRegistrationShape, normaliseRegistration } from "./status";

// The garage (Task 50): a customer's saved vehicles, with DVLA details kept on
// the row (migration 0073).
//
// One implementation for both clients. The website's garage page and actions
// and the mobile routes (GET and POST /api/mobile/v1/garage) all call these, so
// the refresh rule and the add checks can't drift.
//
// WHO IS ASKING always comes from the trusted layer (the cookie session, or a
// verified Bearer token) as `customerId`. Reads and DVLA writes use the service
// role, because customers may not write the DVLA columns (0073 grants them
// `nickname` only). Renaming and removing take the caller's own client, so RLS
// scopes them the same way it does for the app, which does both directly.

/** A ceiling, like saved addresses: a garage, not a fleet register. */
export const GARAGE_LIMIT = 20;

/** DVLA refreshes per garage view, so a first visit to a big backfilled garage can't fire twenty lookups. */
const REFRESHES_PER_VIEW = 6;

export const NICKNAME_MAX = 30;

const COLUMNS =
  "id, registration, nickname, make, model, colour, fuel_type, year_of_manufacture, mot_status, mot_expiry_date, tax_status, tax_due_date, details_checked_at, created_at";

export interface GarageVehicle {
  id: string;
  /** "S28BSW": as stored. */
  registration: string;
  /** "S28 BSW": for display. */
  displayRegistration: string;
  nickname: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  fuelType: string | null;
  yearOfManufacture: number | null;
  motStatus: string | null;
  motExpiryDate: string | null;
  taxStatus: string | null;
  taxDueDate: string | null;
  detailsCheckedAt: string | null;
  createdAt: string;
}

interface VehicleRow {
  id: string;
  registration: string;
  nickname: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  fuel_type: string | null;
  year_of_manufacture: number | null;
  mot_status: string | null;
  mot_expiry_date: string | null;
  tax_status: string | null;
  tax_due_date: string | null;
  details_checked_at: string | null;
  created_at: string;
}

function fromRow(row: VehicleRow): GarageVehicle {
  return {
    id: row.id,
    registration: row.registration,
    displayRegistration: formatRegistration(row.registration),
    nickname: row.nickname,
    make: row.make,
    model: row.model,
    colour: row.colour,
    fuelType: row.fuel_type,
    yearOfManufacture: row.year_of_manufacture,
    motStatus: row.mot_status,
    motExpiryDate: row.mot_expiry_date,
    taxStatus: row.tax_status,
    taxDueDate: row.tax_due_date,
    detailsCheckedAt: row.details_checked_at,
    createdAt: row.created_at,
  };
}

/** The DVLA columns for a successful lookup, keeping what we had where DVLA is silent. */
function detailColumns(details: VehicleDetails, checkedAt: string, previous?: Partial<VehicleRow>) {
  return {
    make: details.make || previous?.make || null,
    model: details.model || previous?.model || null,
    colour: details.colour ?? null,
    fuel_type: details.fuelType ?? null,
    year_of_manufacture: details.yearOfManufacture ?? null,
    mot_status: details.motStatus ?? null,
    mot_expiry_date: details.motExpiryDate ?? null,
    tax_status: details.taxStatus ?? null,
    tax_due_date: details.taxDueDate ?? null,
    details_checked_at: checkedAt,
  };
}

/** "" → null; too long → false. */
export function cleanNickname(value: unknown): string | null | false {
  const nickname = typeof value === "string" ? value.trim() : "";
  if (!nickname) return null;
  return nickname.length > NICKNAME_MAX ? false : nickname;
}

async function refreshStale(
  admin: ReturnType<typeof createAdminClient>,
  rows: VehicleRow[],
  now: Date,
): Promise<VehicleRow[]> {
  const stale = rows
    .filter((row) =>
      detailsStale(
        {
          detailsCheckedAt: row.details_checked_at,
          motExpiryDate: row.mot_expiry_date,
          taxDueDate: row.tax_due_date,
        },
        now,
      ),
    )
    .slice(0, REFRESHES_PER_VIEW);
  if (stale.length === 0) return rows;

  const checkedAt = now.toISOString();
  const refreshed = await Promise.all(
    stale.map(async (row): Promise<VehicleRow> => {
      const result = await lookupVehicleAction(row.registration);
      let patch: Partial<VehicleRow> | null = null;
      if (result.ok) {
        patch = detailColumns(result.details, checkedAt, row);
      } else if (result.code === "not_found" || result.code === "invalid_reg") {
        // A real answer ("DVLA doesn't know this plate"): don't ask again until it's due.
        patch = { details_checked_at: checkedAt };
      }
      // A rate limit or network failure isn't an answer. Try again next time.
      if (!patch) return row;

      const { error } = await admin.from("customer_vehicles").update(patch).eq("id", row.id);
      if (error) {
        console.error("[garage] refresh failed", row.id, error.message);
        return row;
      }
      return { ...row, ...patch };
    }),
  );

  const byId = new Map(refreshed.map((row) => [row.id, row]));
  return rows.map((row) => byId.get(row.id) ?? row);
}

export type GarageList =
  | { ok: true; vehicles: GarageVehicle[]; available: boolean }
  | { ok: false; error: string };

/** The customer's garage, oldest first, with stale DVLA details refreshed first. */
export async function listGarage(
  customerId: string,
  options: { refresh?: boolean; now?: Date } = {},
): Promise<GarageList> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customer_vehicles")
    .select(COLUMNS)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { ok: true, vehicles: [], available: false };
    console.error("[garage] list failed", customerId, error.message);
    return { ok: false, error: "We couldn't load your garage. Please try again." };
  }

  let rows = (data ?? []) as unknown as VehicleRow[];
  if (options.refresh !== false) rows = await refreshStale(admin, rows, options.now ?? new Date());
  return { ok: true, vehicles: rows.map(fromRow), available: true };
}

export type AddVehicleResult =
  | { ok: true; vehicle: GarageVehicle; alreadySaved: boolean }
  | { ok: false; error: string };

/**
 * Add a vehicle after checking it with DVLA. Adding one that's already there
 * returns it, so a double tap isn't an error.
 */
export async function addToGarage(
  customerId: string,
  input: { registration: unknown; nickname?: unknown },
  now: Date = new Date(),
): Promise<AddVehicleResult> {
  const registration =
    typeof input.registration === "string" ? normaliseRegistration(input.registration) : "";
  if (!registration) return { ok: false, error: "Enter the registration number." };
  if (!isRegistrationShape(registration)) {
    return { ok: false, error: "That doesn't look like a valid UK registration." };
  }
  const nickname = cleanNickname(input.nickname);
  if (nickname === false) {
    return { ok: false, error: `Keep the nickname to ${NICKNAME_MAX} characters or fewer.` };
  }

  const admin = createAdminClient();
  const { data: existing, error } = await admin
    .from("customer_vehicles")
    .select(COLUMNS)
    .eq("customer_id", customerId);
  if (error) {
    if (isMissingTable(error)) {
      return { ok: false, error: "Your garage isn't available yet. Please try again later." };
    }
    console.error("[garage] add: read failed", customerId, error.message);
    return { ok: false, error: "We couldn't add that vehicle. Please try again." };
  }

  const rows = (existing ?? []) as unknown as VehicleRow[];
  const same = rows.find((row) => row.registration === registration);
  if (same) return { ok: true, vehicle: fromRow(same), alreadySaved: true };
  if (rows.length >= GARAGE_LIMIT) {
    return {
      ok: false,
      error: `You can keep up to ${GARAGE_LIMIT} vehicles in your garage. Remove one to add another.`,
    };
  }

  const lookup = await lookupVehicleAction(registration);
  if (!lookup.ok) {
    if (lookup.code === "not_found") {
      return {
        ok: false,
        error: "We couldn't find that registration with the DVLA. Please check it and try again.",
      };
    }
    if (lookup.code === "invalid_reg") {
      return { ok: false, error: "That doesn't look like a valid UK registration." };
    }
    return { ok: false, error: "We couldn't check that registration just now. Please try again shortly." };
  }

  const { data: inserted, error: insertError } = await admin
    .from("customer_vehicles")
    .insert({
      customer_id: customerId,
      registration,
      nickname,
      ...detailColumns(lookup.details, now.toISOString()),
    })
    .select(COLUMNS)
    .single();
  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      // Added by a second tap in the meantime.
      const { data: raced } = await admin
        .from("customer_vehicles")
        .select(COLUMNS)
        .eq("customer_id", customerId)
        .eq("registration", registration)
        .maybeSingle();
      if (raced) return { ok: true, vehicle: fromRow(raced as unknown as VehicleRow), alreadySaved: true };
    }
    console.error("[garage] add: insert failed", customerId, insertError?.message);
    return { ok: false, error: "We couldn't add that vehicle. Please try again." };
  }

  return { ok: true, vehicle: fromRow(inserted as unknown as VehicleRow), alreadySaved: false };
}

/** Rename one of the caller's vehicles, through their own client (RLS). */
export async function renameGarageVehicle(
  db: SupabaseClient,
  id: string,
  nicknameInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nickname = cleanNickname(nicknameInput);
  if (nickname === false) {
    return { ok: false, error: `Keep the nickname to ${NICKNAME_MAX} characters or fewer.` };
  }
  const { data, error } = await db.from("customer_vehicles").update({ nickname }).eq("id", id).select("id");
  if (error) {
    console.error("[garage] rename failed", id, error.message);
    return { ok: false, error: "We couldn't rename that vehicle. Please try again." };
  }
  if (!data?.length) return { ok: false, error: "We couldn't find that vehicle in your garage." };
  return { ok: true };
}

/** Remove one of the caller's vehicles, through their own client (RLS). Their bookings are untouched. */
export async function removeGarageVehicle(
  db: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db.from("customer_vehicles").delete().eq("id", id).select("id");
  if (error) {
    console.error("[garage] remove failed", id, error.message);
    return { ok: false, error: "We couldn't remove that vehicle. Please try again." };
  }
  if (!data?.length) return { ok: false, error: "We couldn't find that vehicle in your garage." };
  return { ok: true };
}

/**
 * A signed-in booking puts its vehicle in the garage if it isn't there already.
 * Never fails the booking: before 0073, or on any error, it just doesn't happen.
 * No DVLA call here; the first garage view fills the details in.
 */
export async function recordBookedVehicle(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  vehicle: { registration: string | null; make: string | null; model: string | null },
): Promise<void> {
  const registration = vehicle.registration ? normaliseRegistration(vehicle.registration) : "";
  if (!isRegistrationShape(registration)) return;
  const { error } = await admin.from("customer_vehicles").upsert(
    {
      customer_id: customerId,
      registration,
      make: vehicle.make?.trim() || null,
      model: vehicle.model?.trim() || null,
    },
    { onConflict: "customer_id,registration", ignoreDuplicates: true },
  );
  if (error && !isMissingTable(error)) {
    console.error("[garage] record booked vehicle failed", customerId, error.message);
  }
}
