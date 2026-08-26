// Seed realistic customer-dashboard data for DESIGN work.
//
// Why this exists: the repair catalogue is the whole booking funnel since
// Task 17, so while HaynesPro is down nobody can create a booking through the
// UI — and with zero bookings the dashboard renders nothing but empty states.
// That blocks design work on the very screens that most need it.
//
// A booking row does not actually need HaynesPro. The catalogue only prices the
// repair during the funnel; everything the dashboard reads
// (repair_description, total_pence, status, mechanic, timestamps) is a plain
// column. So this writes rows directly, in the SAME SHAPE
// lib/bookings/create-booking.ts writes them — designing against unrealistic
// data is worse than designing against none.
//
//   node scripts/seed-design-data.mjs            → dry run, reports the plan
//   node scripts/seed-design-data.mjs --write    → create it
//   node scripts/seed-design-data.mjs --clean    → remove everything it made
//
// Idempotent: --write clears its own previous rows first, so re-running gives
// the same nine bookings rather than piling up. It only ever touches rows
// belonging to the two accounts below, so it cannot disturb real data.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const WRITE = process.argv.includes("--write");
const CLEAN = process.argv.includes("--clean");

// Dedicated accounts, so cleanup is exact and nothing lands on a real customer.
const CUSTOMER = { email: "design.customer@bookmytech.test", password: "DesignPass!123", name: "Alex Morgan" };
const MECHANIC = { email: "design.mechanic@bookmytech.test", password: "DesignPass!123", name: "Sam Rivera" };

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const hours = (n) => new Date(Date.now() + n * 3600_000).toISOString();
const days = (n) => hours(n * 24);
/** n days from now, snapped to a clean hour — seeded times are read by a human. */
const dayAt = (n, hour) => {
  const d = new Date(Date.now() + n * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function findUser(email) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureUser({ email, password, name }) {
  let user = await findUser(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
  }
  // handle_new_user creates the profile row; set the display name either way.
  await admin.from("profiles").update({ full_name: name }).eq("id", user.id);
  return user.id;
}

// --- The nine bookings ------------------------------------------------------
// One per dashboard state, so every surface has something to render.
function plan(customerId, mechanicId) {
  const base = {
    customer_id: customerId,
    customer_email: CUSTOMER.email,
    customer_name: CUSTOMER.name,
    customer_phone: "07700 900123",
    address_line_1: "14 Ashfield Road",
    postcode: "M20 3AA",
    parking_type: "driveway",
    payment_mode: "preauth",
    commission_rate: 0.15,
    hourly_rate_pence: 6500,
    parts_price_pence: 0,
  };
  const priced = (totalPence, hrs) => ({
    total_pence: totalPence,
    base_price_pence: totalPence,
    service_duration_hours: hrs,
    platform_fee_pence: Math.round(totalPence * 0.15),
    mechanic_payout_pence: totalPence - Math.round(totalPence * 0.15),
  });

  return [
    { label: "ACTIVE · mechanic en route", row: { ...base, ...priced(18500, 2.0),
      repair_description: "Front brake discs and pads", repair_node_id: "seed-brakes",
      vehicle_reg: "MA21 XKD", vehicle_make: "Volkswagen", vehicle_model: "Golf",
      status: "en_route", mechanic_id: mechanicId,
      scheduled_at: hours(1), slot_window: "09:00–11:00", en_route_at: hours(-0.4) } },

    { label: "UPCOMING · confirmed", row: { ...base, ...priced(24000, 3.0),
      repair_description: "Full service", repair_node_id: "seed-service",
      vehicle_reg: "MA21 XKD", vehicle_make: "Volkswagen", vehicle_model: "Golf",
      status: "confirmed", mechanic_id: mechanicId,
      scheduled_at: days(3), slot_window: "13:00–15:00" } },

    { label: "UPCOMING · mechanic proposed a new time", row: { ...base, ...priced(9500, 1.0),
      repair_description: "Cambelt inspection", repair_node_id: "seed-cambelt",
      vehicle_reg: "YT19 PLM", vehicle_make: "Ford", vehicle_model: "Focus",
      status: "confirmed", mechanic_id: mechanicId,
      scheduled_at: dayAt(5, 8), slot_window: "08:00–10:00",
      reschedule_status: "proposed", reschedule_proposed_at: dayAt(6, 14),
      reschedule_note: "Waiting on a part — could we push it back a day, early afternoon?" } },

    { label: "UPCOMING · still sourcing a mechanic", row: { ...base, ...priced(13500, 1.5),
      repair_description: "Rear brake pads", repair_node_id: "seed-rear-pads",
      vehicle_reg: "YT19 PLM", vehicle_make: "Ford", vehicle_model: "Focus",
      status: "sourcing_mechanic", mechanic_id: null,
      scheduled_at: days(7), slot_window: "10:00–12:00" } },

    { label: "PAST · completed + reviewed", row: { ...base, ...priced(21000, 2.5),
      repair_description: "Clutch replacement", repair_node_id: "seed-clutch",
      vehicle_reg: "MA21 XKD", vehicle_make: "Volkswagen", vehicle_model: "Golf",
      status: "completed", mechanic_id: mechanicId,
      scheduled_at: days(-12), slot_window: "09:00–11:00",
      en_route_at: days(-12), started_at: days(-12), completed_at: days(-12) } },

    { label: "PAST · completed <48h, review + dispute still open", row: { ...base, ...priced(8900, 1.0),
      repair_description: "Battery replacement", repair_node_id: "seed-battery",
      vehicle_reg: "YT19 PLM", vehicle_make: "Ford", vehicle_model: "Focus",
      status: "completed", mechanic_id: mechanicId,
      scheduled_at: hours(-20), slot_window: "14:00–16:00",
      en_route_at: hours(-20), started_at: hours(-20), completed_at: hours(-19) } },

    { label: "PAST · completed, older", row: { ...base, ...priced(15500, 2.0),
      repair_description: "Alternator replacement", repair_node_id: "seed-alternator",
      vehicle_reg: "MA21 XKD", vehicle_make: "Volkswagen", vehicle_model: "Golf",
      status: "completed", mechanic_id: mechanicId,
      scheduled_at: days(-45), slot_window: "11:00–13:00",
      en_route_at: days(-45), started_at: days(-45), completed_at: days(-45) } },

    { label: "PAST · cancelled", row: { ...base, ...priced(11000, 1.5),
      repair_description: "Coolant flush", repair_node_id: "seed-coolant",
      vehicle_reg: "YT19 PLM", vehicle_make: "Ford", vehicle_model: "Focus",
      status: "cancelled", mechanic_id: null,
      scheduled_at: days(-20), slot_window: "09:00–11:00",
      cancellation_reason: "Sorted it myself in the end" } },

    { label: "PAST · disputed", row: { ...base, ...priced(19500, 2.5),
      repair_description: "Suspension arm replacement", repair_node_id: "seed-suspension",
      vehicle_reg: "MA21 XKD", vehicle_make: "Volkswagen", vehicle_model: "Golf",
      status: "disputed", mechanic_id: mechanicId,
      scheduled_at: days(-6), slot_window: "13:00–15:00",
      en_route_at: days(-6), started_at: days(-6), completed_at: days(-6) } },
  ];
}

async function clean(customerId) {
  if (!customerId) return 0;
  const { data: ids } = await admin.from("bookings").select("id").eq("customer_id", customerId);
  const bookingIds = (ids ?? []).map((b) => b.id);
  if (bookingIds.length) {
    // Children first — these carry FKs back to bookings.
    for (const t of ["reviews", "disputes", "booking_events", "booking_media", "messages"]) {
      await admin.from(t).delete().in("booking_id", bookingIds);
    }
    await admin.from("bookings").delete().in("id", bookingIds);
  }
  return bookingIds.length;
}

// --- Run --------------------------------------------------------------------
console.log(`Supabase project: ${ref}`);

if (!WRITE && !CLEAN) {
  console.log("\nDRY RUN — nothing written. Pass --write to apply, --clean to remove.\n");
  console.log(`Would ensure accounts:\n  customer ${CUSTOMER.email} / ${CUSTOMER.password}\n  mechanic ${MECHANIC.email} / ${MECHANIC.password}\n`);
  console.log("Would create 9 bookings:");
  for (const { label } of plan("<customer>", "<mechanic>")) console.log(`  · ${label}`);
  console.log("\nPlus 1 review, 1 open dispute, and a rating/job_count on the mechanic.");
  process.exit(0);
}

if (CLEAN) {
  const user = await findUser(CUSTOMER.email);
  const removed = await clean(user?.id);
  console.log(`\nDeleted ${removed} booking(s) and their child rows.`);
  for (const { email } of [CUSTOMER, MECHANIC]) {
    const u = await findUser(email);
    if (u) { await admin.auth.admin.deleteUser(u.id); console.log(`Deleted account ${email}`); }
  }
  console.log("Clean complete.");
  process.exit(0);
}

const customerId = await ensureUser(CUSTOMER);
const mechanicId = await ensureUser(MECHANIC);

// The mechanic needs a mechanics row to be assignable, and a rating so the
// active-booking card and past-jobs list render something believable.
await admin.from("mechanics").upsert({
  id: mechanicId, status: "online", base_postcode: "M20 2RN",
  service_radius_miles: 15, bio: "15 years on the tools, mostly German marques.",
  specialisms: ["brakes", "servicing", "diagnostics"],
  rating: 4.8, job_count: 127, approved_at: days(-400), is_suspended: false,
});
await admin.from("profiles").update({ role: "mechanic" }).eq("id", mechanicId);

const removed = await clean(customerId);
if (removed) console.log(`Cleared ${removed} previously seeded booking(s).`);

const rows = plan(customerId, mechanicId);
const { data: inserted, error } = await admin
  .from("bookings").insert(rows.map((r) => r.row)).select("id, status, repair_description, job_number");
if (error) { console.error("Insert failed:", error.message); process.exit(1); }

console.log(`\nCreated ${inserted.length} bookings:`);
inserted.forEach((b) => console.log(`  ${String(b.job_number ?? "—").padStart(5)}  ${b.status.padEnd(18)} ${b.repair_description}`));

// A review on the older completed job, and an open dispute on the disputed one.
const reviewed = inserted.find((b) => b.repair_description === "Clutch replacement");
const disputed = inserted.find((b) => b.status === "disputed");

if (reviewed) {
  await admin.from("reviews").insert({
    booking_id: reviewed.id, customer_id: customerId, mechanic_id: mechanicId,
    rating: 5, tags: ["on_time", "tidy_work"],
    comment: "Turned up on time, explained everything clearly and left the drive spotless.",
  });
  console.log("\nAdded 1 review (5★) on the clutch job.");
}
if (disputed) {
  await admin.from("disputes").insert({
    booking_id: disputed.id, opened_by: customerId, opened_by_role: "customer",
    reason_category: "workmanship", photos: [],
    description: "There's still a knocking noise over bumps — I don't think the arm was seated properly.",
    refund_requested_pence: 9750, status: "opened",
  });
  console.log("Added 1 open dispute on the suspension job.");
}

console.log(`\nSign in at /login as:\n  ${CUSTOMER.email}\n  ${CUSTOMER.password}`);
console.log(`\nMechanic side at /mechanic/login as:\n  ${MECHANIC.email}\n  ${MECHANIC.password}`);
console.log("\nRe-run with --clean to remove all of it.");
