// Lifecycle SMS template registry. Single source of truth for the default copy
// of every automated SMS the platform sends, the merge variables each one
// accepts, and the human labels the admin editor shows. Admin edits are stored
// as overrides in the `sms_templates` table (0030); when a key has no override,
// the sender falls back to `defaultBody` here.
//
// Plain module (no "server-only") so the admin editor UI can import the defs &
// the interpolation helper. The DB fetch lives in ./render-template (server).

export interface TemplateVariable {
  /** Token name used as {{name}} in the body. */
  name: string;
  /** Shown next to the token in the editor so admins know what it resolves to. */
  description: string;
  /** Example value used for the live preview in the editor. */
  example: string;
}

export interface SmsTemplateDef {
  key: string;
  /** Short label for the editor. */
  label: string;
  /** When this SMS fires. */
  description: string;
  variables: TemplateVariable[];
  defaultBody: string;
}

export const SMS_TEMPLATE_DEFS: readonly SmsTemplateDef[] = [
  {
    key: "booking_received",
    label: "Booking received",
    description: "Sent to the customer the moment a booking is created, while we find a mechanic.",
    variables: [
      { name: "ref", description: "Short booking reference", example: "A1B2C3D4" },
    ],
    defaultBody:
      "Booking received with Book My Tech (ref {{ref}}). We're finding your mechanic — you'll hear from us shortly.",
  },
  {
    key: "mechanic_en_route",
    label: "Mechanic on the way",
    description: "Sent when the mechanic marks themselves en route to the customer.",
    variables: [],
    defaultBody:
      "Your Book My Tech mechanic is on the way. Please make sure your vehicle is accessible.",
  },
  {
    key: "job_complete_charged",
    label: "Job complete (payment taken)",
    description: "Sent on job completion when a payment was captured from the customer.",
    variables: [
      { name: "total", description: "Total amount charged", example: "£89.00" },
    ],
    defaultBody: "Your Book My Tech job is complete. Total charged: {{total}}. Thanks!",
  },
  {
    key: "job_complete_credit",
    label: "Job complete (paid by credit)",
    description: "Sent on job completion when account credit covered the full amount.",
    variables: [],
    defaultBody:
      "Your Book My Tech job is complete — paid in full with your account credit. Thanks!",
  },
  {
    key: "booking_cancelled_fee",
    label: "Booking cancelled (fee charged)",
    description: "Sent when a booking is cancelled and a cancellation fee was taken.",
    variables: [
      { name: "fee", description: "Cancellation fee charged", example: "£15.00" },
    ],
    defaultBody:
      "Your Book My Tech booking is cancelled. A {{fee}} cancellation fee was charged; the rest of your hold is released.",
  },
  {
    key: "booking_cancelled_nofee",
    label: "Booking cancelled (no fee)",
    description: "Sent when a booking is cancelled with no cancellation fee.",
    variables: [],
    defaultBody:
      "Your Book My Tech booking is cancelled. Your full pre-authorisation has been released.",
  },
  {
    key: "message_fallback",
    label: "New message from mechanic",
    description: "Sent immediately when a mechanic messages the customer and we hold their number.",
    variables: [
      { name: "preview", description: "First ~120 chars of the message", example: "Running 10 mins late, sorry!" },
    ],
    defaultBody:
      'Your Book My Tech mechanic sent you a message: "{{preview}}". Reply in your dashboard.',
  },
  {
    key: "message_nudge",
    label: "Unread message nudge",
    description: "Sent by the sweep when a message stays unread for ~5 minutes.",
    variables: [],
    defaultBody:
      "You have an unread message on your Book My Tech booking. Open your dashboard to reply.",
  },
  {
    key: "reminder",
    label: "Service reminder",
    description: "Sent for scheduled reminders (MOT due, annual service, etc.) when the customer opts into SMS.",
    variables: [
      { name: "label", description: "Reminder name", example: "MOT due" },
      { name: "vehicle_reg", description: "Vehicle registration", example: "AB12 CDE" },
      { name: "cta", description: "Suggested action", example: "book your MOT" },
      { name: "url", description: "Link to act on it", example: "https://bookmytech.co.uk/book" },
    ],
    defaultBody: "{{label}} for {{vehicle_reg}}: {{cta}} — {{url}}",
  },
] as const;

export type SmsTemplateKey = (typeof SMS_TEMPLATE_DEFS)[number]["key"];

export const SMS_TEMPLATE_BY_KEY: Record<string, SmsTemplateDef> = Object.fromEntries(
  SMS_TEMPLATE_DEFS.map((t) => [t.key, t]),
);

/** Replace {{token}} (with optional inner spaces) using `vars`; unknown → "". */
export function interpolateTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    return v == null ? "" : String(v);
  });
}
