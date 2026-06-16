import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderLowCreditEmail } from "@/emails/low-sms-credits";
import { siteUrl } from "@/lib/utils";
import { recordTestOutbox } from "@/lib/test-outbox";

// SMS sender — real Twilio implementation (Task 13 Stage B, sms-credits skill).
//
// Every successful send deducts one SMS credit. The signature is unchanged from
// the original stub so no call site changes: callers stay best-effort and only
// read the boolean (true = a message was dispatched, false = skipped/failed).
//
// Credits never go negative and a credit is never spent on a failed send:
// reserve_sms_credit() atomically gates+decrements BEFORE Twilio, and
// refund_sms_credit() compensates if Twilio rejects. This is the concurrency
// gate — plain read-then-write would oversend under the concurrent cron +
// message-fallback senders.

const LOW_CREDIT_THRESHOLD = 10;
const DEFAULT_SENDER = "BookMyTech"; // alphanumeric fallback sender id
const FALLBACK_ALERT_EMAIL = "brad@thedigicraft.co.uk";

/** Normalise UK numbers to E.164 (+447xxxxxxxxx) before handing to Twilio. */
function normalizeUKPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("44")) return "+" + digits;
  if (digits.startsWith("0")) return "+44" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 10) return "+44" + digits;
  return phone;
}

type Admin = ReturnType<typeof createAdminClient>;

export async function sendSms({
  to,
  body,
}: {
  to: string | null | undefined;
  body: string;
}): Promise<boolean> {
  if (!to) return false;

  // Test mode: capture the SMS and skip Twilio + credit logic (lib/test-outbox.ts).
  if (recordTestOutbox("sms", { to, body })) return true;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    // Dev / unconfigured: behave like the old stub so bookings never block.
    console.log(`[sms stub] to=${to} body="${body.slice(0, 60)}"`);
    return false;
  }

  const admin = createAdminClient();

  // Reserve a credit. null → SMS disabled or zero balance → don't send.
  const { data: balanceAfter, error: reserveErr } = await admin.rpc(
    "reserve_sms_credit",
  );
  if (reserveErr) {
    console.error("[sms] reserve_sms_credit failed", reserveErr);
    return false;
  }
  if (balanceAfter === null || balanceAfter === undefined) {
    // Disabled or out of credit — silently skip (caller is best-effort).
    return false;
  }

  // Sender: the platform's real Twilio number (backend-only, required on trial
  // accounts) always wins; else the admin-set alphanumeric sender id; else a
  // default. The number is never tenant-configurable — SMS is resold centrally.
  const { data: settings } = await admin
    .from("sms_settings")
    .select("sms_sender_name")
    .eq("id", 1)
    .single();
  const from =
    process.env.TWILIO_FROM ||
    settings?.sms_sender_name ||
    DEFAULT_SENDER;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  let sid: string | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: from, To: normalizeUKPhone(to), Body: body }).toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[sms] Twilio send failed", data);
      await admin.rpc("refund_sms_credit");
      await admin.from("sms_log").insert({
        recipient_phone: to,
        message_body: body,
        twilio_sid: null,
        status: "failed",
        credits_used: 0,
      });
      return false;
    }
    sid = data.sid ?? null;
  } catch (err) {
    console.error("[sms] Twilio request error", err);
    await admin.rpc("refund_sms_credit");
    await admin.from("sms_log").insert({
      recipient_phone: to,
      message_body: body,
      twilio_sid: null,
      status: "failed",
      credits_used: 0,
    });
    return false;
  }

  await admin.from("sms_log").insert({
    recipient_phone: to,
    message_body: body,
    twilio_sid: sid,
    status: "sent",
    credits_used: 1,
  });

  if (typeof balanceAfter === "number" && balanceAfter <= LOW_CREDIT_THRESHOLD) {
    await maybeSendLowCreditAlert(admin, balanceAfter);
  }

  return true;
}

/** Email the owner once per drain. The atomic flag flip ensures concurrent
 *  sends don't both send. Re-armed (flag cleared) on the next top-up. */
async function maybeSendLowCreditAlert(admin: Admin, balance: number) {
  // Flip the once-per-drain flag atomically; only proceed if WE flipped it.
  const { data: claimed } = await admin
    .from("sms_settings")
    .update({ sms_low_credit_notified: true })
    .eq("id", 1)
    .eq("sms_low_credit_notified", false)
    .select("low_credit_alert_email")
    .maybeSingle();
  if (!claimed) return; // already notified for this drain

  // Recipient: the panel-set alert email (pre-populated with the admin's own
  // address), falling back to the agency inbox if it was never set.
  const recipient = claimed.low_credit_alert_email?.trim() || FALLBACK_ALERT_EMAIL;

  try {
    const { subject, html } = await renderLowCreditEmail({
      balance,
      settingsUrl: `${siteUrl()}/admin/sms`,
    });
    await sendEmail({ to: recipient, subject, html });
  } catch (err) {
    // Non-fatal — never block the SMS response on the alert email.
    console.error("[sms] low-credit alert email failed", err);
  }
}
