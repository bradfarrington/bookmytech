import "server-only";
import { Resend } from "resend";

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
