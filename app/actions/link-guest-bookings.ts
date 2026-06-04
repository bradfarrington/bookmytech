import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stamp a freshly-created customer's id onto any guest bookings they placed
 * before signing up. Guest bookings have customer_id = null + customer_email
 * set; RLS already lets a logged-in customer SELECT them by email match, so this
 * is mostly tidiness — but it lets us query the dashboard by customer_id and
 * means a later email change doesn't orphan past bookings.
 *
 * Runs via the service-role client (a brand-new customer can't UPDATE rows that
 * still belong to "nobody" under RLS). Returns the number of bookings linked.
 */
export async function linkGuestBookings(
  userId: string,
  email: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .update({ customer_id: userId })
    .is("customer_id", null)
    .eq("customer_email", email)
    .select("id");
  if (error) {
    console.error("Failed to link guest bookings for", email, error.message);
    return 0;
  }
  return data?.length ?? 0;
}
