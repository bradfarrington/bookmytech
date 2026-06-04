import "server-only";

// SMS sender — STUB.
//
// Per the project's notifications decision (email + SMS, push deferred to the
// native app), in-app messages are meant to fall back to SMS when the recipient
// hasn't seen them in ~5 minutes. The actual Twilio sender isn't built yet, so
// this logs and no-ops. When the SMS infra lands, implement this against
// Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM) and wire the
// 5-minute unread sweep (a cron over `messages` where read_at is null and
// created_at < now() - interval '5 minutes').
//
// Returns true if a message was actually dispatched, false if stubbed/skipped.
export async function sendSms({
  to,
  body,
}: {
  to: string | null | undefined;
  body: string;
}): Promise<boolean> {
  if (!to) return false;
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.log(`[sms stub] to=${to} body="${body.slice(0, 60)}"`);
    return false;
  }
  // TODO: real Twilio send once the SMS infra (sms-credits skill / Twilio) is wired.
  console.log(`[sms stub — twilio configured but sender not implemented] to=${to}`);
  return false;
}
