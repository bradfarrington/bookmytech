// One-off cleanup for e2e seed/test data. Service-role; bypasses RLS.
//   node scripts/e2e-cleanup.mjs          → dry run (report only)
//   node scripts/e2e-cleanup.mjs --delete → actually delete
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DELETE = process.argv.includes("--delete");
const TEST_EMAILS = [
  "e2e.customer@bookmytech.test",
  "e2e.mechanic@bookmytech.test",
  "e2e.admin@bookmytech.test",
];
const BOOKING_EMAIL_LIKE = "e2e-%@bookmytech.test"; // guest + credit-flow booking emails

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function findUsers() {
  const ids = {};
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (TEST_EMAILS.includes((u.email ?? "").toLowerCase())) ids[u.email] = u.id;
    }
    if (data.users.length < 200) break;
  }
  return ids;
}

const users = await findUsers();
const customerId = users["e2e.customer@bookmytech.test"] ?? null;

// Bookings made by the credit flow (signed-in customer) OR any e2e-* email guest.
let bookingFilter = admin.from("bookings").select("id");
const orParts = [`customer_email.like.${BOOKING_EMAIL_LIKE}`];
if (customerId) orParts.push(`customer_id.eq.${customerId}`);
const { data: bookings } = await admin
  .from("bookings")
  .select("id, customer_email, payment_mode, status, created_at")
  .or(orParts.join(","));
const bookingIds = (bookings ?? []).map((b) => b.id);

const { count: creditCount } = await admin
  .from("customer_credits")
  .select("id", { count: "exact", head: true })
  .eq("description", "e2e test credit");

console.log("=== e2e data found ===");
console.log("auth users:", users);
console.log("bookings:", bookingIds.length, bookings?.map((b) => `${b.id.slice(0,8)} ${b.payment_mode}/${b.status} ${b.customer_email}`));
console.log("customer_credits (e2e test credit) rows:", creditCount ?? 0);

if (!DELETE) {
  console.log("\nDry run. Re-run with --delete to remove the above.");
  process.exit(0);
}

console.log("\n=== deleting ===");
// Children first (in case FKs aren't ON DELETE CASCADE), then bookings.
if (bookingIds.length) {
  for (const table of ["booking_parts", "booking_events", "funnel_events", "job_offers", "disputes", "reviews"]) {
    const { error, count } = await admin.from(table).delete({ count: "exact" }).in("booking_id", bookingIds);
    if (error && !/does not exist|column .* does not exist/i.test(error.message)) {
      console.log(`  ${table}: skipped (${error.message})`);
    } else {
      console.log(`  ${table}: deleted ${count ?? 0}`);
    }
  }
  const { error: bErr, count: bCount } = await admin.from("bookings").delete({ count: "exact" }).in("id", bookingIds);
  console.log(bErr ? `  bookings: ERROR ${bErr.message}` : `  bookings: deleted ${bCount ?? 0}`);
}

// All credit rows for the test customer (grants + redemptions), plus the tagged grant.
if (customerId) {
  const { count } = await admin.from("customer_credits").delete({ count: "exact" }).eq("customer_id", customerId);
  console.log(`  customer_credits (customer): deleted ${count ?? 0}`);
}

// Rows that FK to profiles(id) without ON DELETE CASCADE block the auth-user
// delete (which cascade-deletes profiles). Clear the customer's tracked events.
if (customerId) {
  const { error, count } = await admin
    .from("funnel_events")
    .delete({ count: "exact" })
    .eq("user_id", customerId);
  console.log(error ? `  funnel_events(user): ${error.message}` : `  funnel_events(user): deleted ${count ?? 0}`);
}

// Auth users (cascades profiles via FK). Do this last.
for (const [email, id] of Object.entries(users)) {
  const { error } = await admin.auth.admin.deleteUser(id);
  console.log(error ? `  user ${email}: ERROR ${error.message}` : `  user ${email}: deleted`);
}

console.log("\nDone. (Stripe test-mode PaymentIntents are left as-is — harmless, test mode only.)");
