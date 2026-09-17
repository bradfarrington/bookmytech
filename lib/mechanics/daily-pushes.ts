import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { areaOf, dayMoney, isOpenJob, mechanicJobsOn } from "@/lib/mechanics/day-summary";
import { recapPushBody, tomorrowPushBody } from "@/lib/mechanics/today";
import { ANDROID_UPDATES_CHANNEL } from "@/lib/push/format";
import { sendPushToMechanic } from "@/lib/push/send";
import { addDaysToKey, londonDateKey, londonInstant } from "@/lib/slots";

// The mechanic app's two once-a-day pushes (Task 66), both on the quiet
// `updates` channel:
//
//   tomorrow  "Tomorrow at a glance", in the evening — /api/cron/tomorrow-at-a-glance
//   recap     "Job well done", when the day's last job completes — completeAndCharge
//
// `data.type` + `data.day` are what the app deep-links on
// (bmtmechanic://tomorrow?day=… and bmtmechanic://recap?day=…); both screens
// then load GET /mechanic/summary, which adds the figures up the same way
// (lib/mechanics/day-summary.ts), so the banner and the screen agree.
//
// "Once per mechanic per day" is `mechanic_daily_pushes` (0083): the insert is
// the lock, and only whoever wins it sends.

type Admin = ReturnType<typeof createAdminClient>;
type Kind = "tomorrow" | "recap";

async function claim(admin: Admin, mechanicId: string, day: string, kind: Kind): Promise<boolean> {
  const { error } = await admin.from("mechanic_daily_pushes").insert({ mechanic_id: mechanicId, day, kind });
  if (!error) return true;
  // 23505: already sent. Anything else (42P01 — 0083 not applied yet) is worth a log.
  if (error.code !== "23505") console.error(`[daily-push] couldn't claim ${kind} for ${day}`, error);
  return false;
}

/**
 * "Job well done" — call after a job completes. Sends only when nothing of the
 * mechanic's is still to do that London day. Best-effort: never throws.
 */
export async function sendEndOfDayRecap(admin: Admin, mechanicId: string, now: Date = new Date()): Promise<void> {
  try {
    const day = londonDateKey(now);
    const jobs = await mechanicJobsOn(admin, mechanicId, day);
    if (jobs.some((j) => isOpenJob(j.status))) return;

    const { earnedPence, completedJobs } = dayMoney(jobs);
    // The job just completed may have been scheduled for another day (finished
    // late, or early); then there is no "today" to recap.
    if (completedJobs === 0) return;
    if (!(await claim(admin, mechanicId, day, "recap"))) return;

    await sendPushToMechanic(mechanicId, {
      title: "Job well done",
      body: recapPushBody(earnedPence, completedJobs),
      data: { type: "recap", day },
      channelId: ANDROID_UPDATES_CHANNEL,
    });
  } catch (err) {
    console.error("[daily-push] recap failed", err);
  }
}

/**
 * "Tomorrow at a glance" to every mechanic with a job tomorrow and a device to
 * hear about it on.
 */
export async function sendTomorrowAtAGlance(now: Date = new Date()): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const day = addDaysToKey(londonDateKey(now), 1);

  const { data: booked, error } = await admin
    .from("bookings")
    .select("mechanic_id")
    .not("mechanic_id", "is", null)
    .neq("status", "cancelled")
    .gte("scheduled_at", londonInstant(day, 0).toISOString())
    .lt("scheduled_at", londonInstant(addDaysToKey(day, 1), 0).toISOString());
  if (error) throw error;
  const mechanicIds = [...new Set((booked ?? []).map((b) => b.mechanic_id as string))];
  if (mechanicIds.length === 0) return { sent: 0 };

  const { data: devices, error: devicesError } = await admin
    .from("mechanic_push_tokens")
    .select("mechanic_id")
    .in("mechanic_id", mechanicIds);
  if (devicesError) throw devicesError;
  const reachable = new Set((devices ?? []).map((d) => d.mechanic_id as string));

  let sent = 0;
  for (const mechanicId of mechanicIds) {
    if (!reachable.has(mechanicId)) continue;
    try {
      const jobs = await mechanicJobsOn(admin, mechanicId, day);
      if (jobs.length === 0) continue;
      if (!(await claim(admin, mechanicId, day, "tomorrow"))) continue;

      await sendPushToMechanic(mechanicId, {
        title: "Tomorrow at a glance",
        body: tomorrowPushBody({
          jobCount: jobs.length,
          bookedPence: dayMoney(jobs).bookedPence,
          firstAt: jobs[0].scheduled_at,
          firstArea: areaOf(jobs[0]),
        }),
        data: { type: "tomorrow", day },
        channelId: ANDROID_UPDATES_CHANNEL,
      });
      sent += 1;
    } catch (err) {
      // One mechanic's failure must not cost the rest their evening summary.
      console.error("[daily-push] tomorrow failed for", mechanicId, err);
    }
  }
  return { sent };
}
