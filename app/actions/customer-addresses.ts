"use server";

import { deleteAddress, saveAddress, setDefaultAddress } from "@/lib/addresses/store";
import { validateAddressInput } from "@/lib/addresses/validate";
import { createClient } from "@/lib/supabase/server";

// The website's saved addresses (Task 48, Task 49). Thin wrappers over
// lib/addresses/, through the caller's own cookie client, so RLS scopes every
// write to their rows exactly as it does for the app. The caller comes from the
// session; an id from the browser only ever names one of their own rows.

export type AddressActionResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = "Your session has ended. Please sign in again.";
const NOT_FOUND = "We couldn't find that address.";
const UUID = /^[0-9a-f-]{36}$/i;

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Add an address (`id` null) or update one of the caller's. */
export async function saveCustomerAddress(
  id: string | null,
  fields: Record<string, unknown>,
  makeDefault: boolean,
): Promise<AddressActionResult> {
  if (id !== null && (typeof id !== "string" || !UUID.test(id))) return { ok: false, error: NOT_FOUND };
  const { supabase, user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const raw = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  const checked = validateAddressInput(raw);
  if (!checked.ok) return checked;

  const saved = await saveAddress(supabase, user.id, id, checked.value, { makeDefault: makeDefault === true });
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}

export async function deleteCustomerAddress(id: string): Promise<AddressActionResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: NOT_FOUND };
  const { supabase, user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };
  return deleteAddress(supabase, id);
}

export async function setDefaultCustomerAddress(id: string): Promise<AddressActionResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: NOT_FOUND };
  const { supabase, user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };
  const result = await setDefaultAddress(supabase, id);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
