// Prove the customer-facing mechanic visibility rules against the LIVE database
// (Task 19 / P2). Service-role for setup + teardown, real customer sessions for
// every assertion — so this tests the policies as a phone would hit them.
//
//   node scripts/verify-mechanic-visibility.mjs
//
// Creates three throwaway users (two customers, one mechanic), one booking and
// one location row, walks the booking through its statuses, and asserts from
// BOTH customer sessions at each step. Everything it creates is deleted at the
// end (and on failure). Exit code 1 on any failed assertion.
//
// What it proves (the contract in migration 0048):
//   • mechanic_locations: readable by the booking's customer ONLY while the
//     booking is `en_route` and sharing is on; never by another customer;
//     gone once the job is `in_progress`.
//   • mechanic_cards: visible only to customers who have booked that mechanic;
//     `phone` populated only while the job is en_route/in_progress.
//   • bookings realtime (0049): the customer's session receives an UPDATE
//     event for their own booking; the other customer's session receives none.
//
// NOT provable from here: the five-minute staleness window. `updated_at` is
// trigger-stamped to now() on every write (by design — a client must not be
// able to park a stale fix), so there's no way to plant an old row without SQL.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = "Verify-Visibility-1!";
const STAMP = Date.now().toString(36);
const USERS = {
  a: `verify.customer-a.${STAMP}@bookmytech.test`,
  b: `verify.customer-b.${STAMP}@bookmytech.test`,
  m: `verify.mechanic.${STAMP}@bookmytech.test`,
};

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

async function createUser(email, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: role === "mechanic" ? "Verify Mechanic" : "Verify Customer" },
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const id = data.user.id;
  // handle_new_user creates the profile; make sure it exists and carries the role.
  const { error: pErr } = await admin
    .from("profiles")
    .upsert({ id, role, full_name: role === "mechanic" ? "Verify Mechanic" : "Verify Customer", phone: role === "mechanic" ? "07000000000" : null });
  if (pErr) throw new Error(`profile(${email}): ${pErr.message}`);
  return id;
}

async function signIn(email) {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return client;
}

const ids = { a: null, b: null, m: null, booking: null };

async function cleanup() {
  if (ids.booking) await admin.from("bookings").delete().eq("id", ids.booking);
  if (ids.m) {
    await admin.from("mechanic_locations").delete().eq("mechanic_id", ids.m);
    await admin.from("mechanics").delete().eq("id", ids.m);
  }
  for (const id of [ids.a, ids.b, ids.m]) {
    if (id) await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function setStatus(status) {
  const { error } = await admin.from("bookings").update({ status }).eq("id", ids.booking);
  if (error) throw new Error(`setStatus(${status}): ${error.message}`);
}

async function readLocation(client) {
  const { data, error } = await client.from("mechanic_locations").select("mechanic_id, lat, lng").eq("mechanic_id", ids.m);
  if (error) throw new Error(`mechanic_locations read: ${error.message}`);
  return data;
}

async function readCard(client) {
  const { data, error } = await client.from("mechanic_cards").select("id, full_name, phone").eq("id", ids.m).maybeSingle();
  if (error) throw new Error(`mechanic_cards read: ${error.message}`);
  return data;
}

/** Subscribe to bookings changes as this session; resolve with events seen in `ms`. */
function watchBookings(client, ms) {
  return new Promise((resolve) => {
    const seen = [];
    const channel = client
      .channel(`verify-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (payload) => {
        seen.push(payload.eventType);
      });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      client.removeChannel(channel);
      resolve(seen);
    };
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setTimeout(finish, ms);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") finish();
    });
    setTimeout(finish, ms + 5000);
  });
}

try {
  console.log("Setting up throwaway users, booking and location…");
  ids.a = await createUser(USERS.a, "customer");
  ids.b = await createUser(USERS.b, "customer");
  ids.m = await createUser(USERS.m, "mechanic");
  {
    const { error } = await admin.from("mechanics").insert({ id: ids.m, status: "on_job", base_postcode: "M1 1AE", bio: "verify" });
    if (error) throw new Error(`mechanics insert: ${error.message}`);
  }
  {
    const { data, error } = await admin
      .from("bookings")
      .insert({
        customer_id: ids.a,
        customer_email: USERS.a,
        customer_name: "Verify Customer",
        mechanic_id: ids.m,
        vehicle_reg: "VE12RFY",
        vehicle_make: "VERIFY",
        postcode: "M1 1AE",
        status: "confirmed",
        total_pence: 0,
        payment_mode: "free",
        scheduled_at: new Date().toISOString(),
        repair_description: "Visibility check",
      })
      .select("id")
      .single();
    if (error) throw new Error(`bookings insert: ${error.message}`);
    ids.booking = data.id;
  }
  {
    const { error } = await admin.from("mechanic_locations").upsert({
      mechanic_id: ids.m, lat: 53.48, lng: -2.24, speed_mps: 10, sharing_enabled: true,
    });
    if (error) throw new Error(`mechanic_locations upsert: ${error.message}`);
  }

  const A = await signIn(USERS.a);
  const B = await signIn(USERS.b);

  console.log("\nconfirmed (mechanic assigned, not yet en route):");
  check("A cannot see the location yet", (await readLocation(A)).length === 0);
  check("B cannot see the location", (await readLocation(B)).length === 0);
  const cardA0 = await readCard(A);
  check("A sees the mechanic card", !!cardA0 && cardA0.full_name === "Verify Mechanic");
  check("A does NOT get the phone yet", !!cardA0 && cardA0.phone === null, JSON.stringify(cardA0));
  check("B does not see the card at all", (await readCard(B)) === null);

  console.log("\nen_route:");
  // Watch realtime on both sessions across the status change (0049).
  const watchA = watchBookings(A, 4000);
  const watchB = watchBookings(B, 4000);
  await new Promise((r) => setTimeout(r, 1200));
  await setStatus("en_route");
  const locA = await readLocation(A);
  check("A sees the location", locA.length === 1 && locA[0].lat === 53.48, JSON.stringify(locA));
  check("B still cannot see the location", (await readLocation(B)).length === 0);
  const cardA1 = await readCard(A);
  check("A now gets the phone", !!cardA1 && cardA1.phone === "07000000000", JSON.stringify(cardA1));
  check("B still does not see the card", (await readCard(B)) === null);
  const [evA, evB] = await Promise.all([watchA, watchB]);
  check("A's session received a realtime UPDATE for the booking (0049 applied)", evA.includes("UPDATE"), `saw ${JSON.stringify(evA)} — if empty, is 0049 applied?`);
  check("B's session received nothing", evB.length === 0, JSON.stringify(evB));

  console.log("\nen_route, sharing switched off:");
  await admin.from("mechanic_locations").update({ sharing_enabled: false }).eq("mechanic_id", ids.m);
  check("A cannot see the location while sharing is off", (await readLocation(A)).length === 0);
  await admin.from("mechanic_locations").update({ sharing_enabled: true }).eq("mechanic_id", ids.m);
  check("…and sees it again when sharing resumes", (await readLocation(A)).length === 1);

  console.log("\nin_progress (mechanic on site):");
  await setStatus("in_progress");
  check("A can no longer see the location", (await readLocation(A)).length === 0);
  const cardA2 = await readCard(A);
  check("A still gets the phone", !!cardA2 && cardA2.phone === "07000000000", JSON.stringify(cardA2));

  console.log("\ncompleted:");
  await setStatus("completed");
  check("A cannot see the location", (await readLocation(A)).length === 0);
  const cardA3 = await readCard(A);
  check("A still sees the card (past job)", !!cardA3);
  check("…but the phone is gone", !!cardA3 && cardA3.phone === null, JSON.stringify(cardA3));
  check("B never saw the card", (await readCard(B)) === null);
  await A.auth.signOut();
  await B.auth.signOut();
} catch (err) {
  console.error("\nSetup/assertion error:", err.message ?? err);
  failures += 1;
} finally {
  console.log("\nCleaning up…");
  await cleanup();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
