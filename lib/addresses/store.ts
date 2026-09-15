import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/errors";
import {
  ADDRESS_COLUMNS,
  addressFromRow,
  rowFromAddressInput,
  type AddressInput,
  type CustomerAddressRow,
  type SavedAddress,
} from "./validate";

// Saved addresses on the website (Task 49). Every call takes the CALLER'S OWN
// client (the cookie client in a server action), so RLS scopes each read and
// write to their rows exactly as it does for the app, which writes direct.
// The default rules (first address, one default, promote on delete) are
// triggers in 0072, so nothing here repeats them.

export type AddressList =
  | { ok: true; addresses: SavedAddress[]; available: boolean }
  | { ok: false; error: string };

export type AddressResult = { ok: true; address: SavedAddress } | { ok: false; error: string };

const UNAVAILABLE = "Saved addresses aren't available yet. Please try again later.";

function writeError(error: { code?: string; message?: string }): string {
  if (isMissingTable(error)) return UNAVAILABLE;
  // The per-customer cap in the trigger raises a sentence written for customers.
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "23514") return "Please check the address details and try again.";
  return "We couldn't save that address. Please try again.";
}

/** The caller's addresses, default first, then oldest first. */
export async function listAddresses(db: SupabaseClient): Promise<AddressList> {
  const { data, error } = await db
    .from("customer_addresses")
    .select(ADDRESS_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { ok: true, addresses: [], available: false };
    console.error("[addresses] list failed", error.message);
    return { ok: false, error: "We couldn't load your addresses. Please try again." };
  }
  return {
    ok: true,
    addresses: ((data ?? []) as unknown as CustomerAddressRow[]).map(addressFromRow),
    available: true,
  };
}

/** Add an address (`id` null) or update one of the caller's. */
export async function saveAddress(
  db: SupabaseClient,
  customerId: string,
  id: string | null,
  input: AddressInput,
  options: { makeDefault?: boolean } = {},
): Promise<AddressResult> {
  const row = rowFromAddressInput(input);
  const query = id
    ? db
        .from("customer_addresses")
        .update({ ...row, ...(options.makeDefault ? { is_default: true } : {}) })
        .eq("id", id)
        .select(ADDRESS_COLUMNS)
        .maybeSingle()
    : db
        .from("customer_addresses")
        .insert({ ...row, customer_id: customerId, is_default: options.makeDefault ?? false })
        .select(ADDRESS_COLUMNS)
        .maybeSingle();

  const { data, error } = await query;
  if (error) {
    if (!isMissingTable(error) && error.code !== "P0001") {
      console.error("[addresses] save failed", error.code, error.message);
    }
    return { ok: false, error: writeError(error) };
  }
  if (!data) return { ok: false, error: "We couldn't find that address." };
  return { ok: true, address: addressFromRow(data as unknown as CustomerAddressRow) };
}

export async function deleteAddress(db: SupabaseClient, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db.from("customer_addresses").delete().eq("id", id).select("id");
  if (error) {
    if (isMissingTable(error)) return { ok: false, error: UNAVAILABLE };
    console.error("[addresses] delete failed", error.message);
    return { ok: false, error: "We couldn't remove that address. Please try again." };
  }
  if (!data?.length) return { ok: false, error: "We couldn't find that address." };
  return { ok: true };
}

export async function setDefaultAddress(db: SupabaseClient, id: string): Promise<AddressResult> {
  const { data, error } = await db
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", id)
    .select(ADDRESS_COLUMNS)
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error("[addresses] set default failed", error.message);
    return { ok: false, error: writeError(error) };
  }
  if (!data) return { ok: false, error: "We couldn't find that address." };
  return { ok: true, address: addressFromRow(data as unknown as CustomerAddressRow) };
}
