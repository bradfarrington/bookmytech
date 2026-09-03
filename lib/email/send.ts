import "server-only";
import { Resend } from "resend";
import { recordTestOutbox } from "@/lib/test-outbox";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  // An empty body is `renderTemplateEmail`'s signal that an admin switched the
  // template off (emails/resolve.ts → SKIPPED_EMAIL). Nothing to send.
  if (!html) return;
  // Test mode: capture the email and skip the real send (see lib/test-outbox.ts).
  if (recordTestOutbox("email", { to, subject })) return;
  if (!resend) {
    console.log(`[email stub] to=${to} subject="${subject}"`);
    return;
  }
  await resend.emails.send({
    from: "Book My Tech <noreply@bookmytech.co.uk>",
    to,
    subject,
    html,
  });
}
