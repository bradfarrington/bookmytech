import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client for tests — seeds users and reads booking rows directly
// (bypasses RLS). Mirrors lib/supabase/admin.ts but usable outside "server-only".
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — is .env.local loaded?",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface BookingRow {
  id: string;
  status: string;
  total_pence: number;
  stripe_payment_intent_id: string | null;
  customer_email: string | null;
  payment_mode: string | null;
  scheduled_at: string | null;
  slot_window: string | null;
  address_line_1: string | null;
  postcode: string | null;
  credit_applied_pence: number | null;
}

const BOOKING_COLUMNS =
  "id, status, total_pence, stripe_payment_intent_id, customer_email, payment_mode, " +
  "scheduled_at, slot_window, address_line_1, postcode, credit_applied_pence";

/** Look up an auth user's id by email (paginated; the test project is small). */
export async function getUserId(email: string): Promise<string> {
  const admin = adminClient();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No auth user for ${email} — has seed.setup.ts run?`);
}

/**
 * Reset a customer's test credit to exactly `pence` (clears prior e2e grants).
 * A large grant pushes a booking into "free" mode, which completes the booking
 * without Stripe — the only in-browser path that creates a booking + sends the
 * confirmation email (confirmPayment can't be driven; see customer-booking.spec).
 */
export async function setTestCredit(customerId: string, pence: number): Promise<void> {
  const admin = adminClient();
  await admin
    .from("customer_credits")
    .delete()
    .eq("customer_id", customerId)
    .eq("description", "e2e test credit");
  const { error } = await admin.from("customer_credits").insert({
    customer_id: customerId,
    amount_pence: pence,
    source: "promo",
    description: "e2e test credit",
    expires_at: null,
  });
  if (error) throw new Error(`grant credit failed: ${error.message}`);
}

/** Read a booking by id via the service role (the row a confirmation page shows). */
export async function getBooking(id: string): Promise<BookingRow> {
  const { data, error } = await adminClient()
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", id)
    .single();
  if (error || !data) {
    throw new Error(`Booking ${id} not found: ${error?.message ?? "no row"}`);
  }
  return data as unknown as BookingRow;
}

/**
 * Find the booking written against a PaymentIntent, or null.
 *
 * The invariant both ways round: a hold that succeeded must end up with exactly
 * one row, and a payment that failed must leave none.
 */
export async function getBookingByIntent(
  paymentIntentId: string,
): Promise<BookingRow | null> {
  const { data, error } = await adminClient()
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("stripe_payment_intent_id", paymentIntentId);
  if (error) throw new Error(`booking lookup failed: ${error.message}`);
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    throw new Error(`${data.length} bookings share intent ${paymentIntentId}`);
  }
  return data[0] as unknown as BookingRow;
}
