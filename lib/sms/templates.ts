// Lifecycle SMS template registry. Single source of truth for the default copy
// of every automated SMS the platform sends, the merge variables each one
// accepts, and the human labels the admin editor shows. Admin edits are stored
// as overrides in the `sms_templates` table (0030); when a key has no override,
// the sender falls back to `defaultBody` here. Each key can also be switched
// off by an admin (`notification_toggles`, 0053 — see lib/notifications).
//
// Plain module (no "server-only") so the admin editor UI can import the defs &
// the interpolation helper. The DB fetch lives in ./render-template (server).
//
// Copy notes: every text is one credit whatever its length, but a body that
// stays inside GSM-7 (no curly quotes, no en/em dashes, no middle dots) fits
// 160 characters per segment instead of 70. `gsmFriendly` below transliterates
// the few typographic characters our labels use ("8am–10am", "Wed 3 Sep · …")
// so defaults can read naturally and still send cheaply.

export interface TemplateVariable {
  /** Token name used as {{name}} in the body. */
  name: string;
  /** Shown next to the token in the editor so admins know what it resolves to. */
  description: string;
  /** Example value used for the live preview in the editor. */
  example: string;
}

/** Who a template is written for — groups the editor and filters admin pickers. */
export type SmsAudience = "customer" | "mechanic";

export interface SmsTemplateDef {
  key: string;
  /** Short label for the editor. */
  label: string;
  /** When this SMS fires. */
  description: string;
  audience: SmsAudience;
  variables: TemplateVariable[];
  defaultBody: string;
}

export const SMS_TEMPLATE_DEFS: readonly SmsTemplateDef[] = [
  // --- Customer ---------------------------------------------------------------
  {
    key: "booking_received",
    label: "Booking received",
    description: "Sent to the customer the moment a booking is created, while we find a mechanic.",
    audience: "customer",
    variables: [
      { name: "ref", description: "Short booking reference", example: "A1B2C3D4" },
    ],
    defaultBody:
      "Booking received with Book My Tech (ref {{ref}}). We're finding your mechanic — you'll hear from us shortly.",
  },
  {
    key: "mechanic_confirmed",
    label: "Mechanic confirmed",
    description: "Sent to the customer when a mechanic accepts their booking (or an admin assigns one).",
    audience: "customer",
    variables: [
      { name: "mechanic", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "when", description: "Day and arrival window", example: "Wed 3 Sep · 8am–10am" },
      { name: "ref", description: "Booking reference", example: "00123" },
    ],
    defaultBody:
      "Good news — {{mechanic}} has accepted your Book My Tech booking (ref {{ref}}) for {{when}}. We'll text you when they set off.",
  },
  {
    key: "replacement_confirmed",
    label: "Replacement mechanic confirmed",
    description: "Sent to the customer when a replacement mechanic takes over after theirs dropped out.",
    audience: "customer",
    variables: [
      { name: "mechanic", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "when", description: "Day and arrival window", example: "Wed 3 Sep · 8am–10am" },
      { name: "ref", description: "Booking reference", example: "00123" },
    ],
    defaultBody:
      "Your replacement Book My Tech mechanic {{mechanic}} is confirmed for {{when}} (ref {{ref}}). Nothing else changes.",
  },
  {
    key: "arrival_window_confirmed",
    label: "Arrival window confirmed",
    description:
      "Sent to the customer when their mechanic narrows an all-day booking to a 2-hour arrival window.",
    audience: "customer",
    variables: [
      { name: "mechanic", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "window", description: "The 2-hour window", example: "10am–12pm" },
      { name: "day", description: "The day", example: "Wed 3 Sep" },
      { name: "ref", description: "Booking reference", example: "00123" },
    ],
    defaultBody:
      "{{mechanic}} will arrive between {{window}} on {{day}} for your Book My Tech booking (ref {{ref}}).",
  },
  {
    key: "mechanic_proposed_time",
    label: "Mechanic proposed a new time",
    description: "Sent to the customer when their mechanic proposes a different time; they accept or decline at the link.",
    audience: "customer",
    variables: [
      { name: "slot", description: "The proposed date/time", example: "Thu 4 Sep · 14:00" },
      { name: "url", description: "Link to accept or decline", example: "https://bookmytech.co.uk/book/confirmed/…" },
    ],
    defaultBody:
      "Your Book My Tech mechanic has proposed a new time: {{slot}}. Accept or decline here: {{url}}",
  },
  {
    key: "booking_rescheduled",
    label: "Booking rescheduled",
    description: "Sent to the customer confirming the new time after they move their own booking.",
    audience: "customer",
    variables: [
      { name: "slot", description: "The new date/time", example: "Thu 4 Sep · 14:00" },
    ],
    defaultBody:
      "Your Book My Tech booking is now set for {{slot}}. Your pre-authorisation stays in place.",
  },
  {
    key: "finding_replacement",
    label: "Finding a replacement mechanic",
    description: "Sent to the customer when their mechanic drops out and the job is re-broadcast.",
    audience: "customer",
    variables: [],
    defaultBody:
      "Your Book My Tech mechanic can no longer make it. We're finding you a replacement now and will text you as soon as one accepts.",
  },
  {
    key: "mechanic_en_route",
    label: "Mechanic on the way",
    description: "Sent when the mechanic marks themselves en route to the customer.",
    audience: "customer",
    variables: [],
    defaultBody:
      "Your Book My Tech mechanic is on the way. Please make sure your vehicle is accessible.",
  },
  {
    key: "job_complete_charged",
    label: "Job complete (payment taken)",
    description: "Sent on job completion when a payment was captured from the customer.",
    audience: "customer",
    variables: [
      { name: "total", description: "Total amount charged", example: "£89.00" },
    ],
    defaultBody: "Your Book My Tech job is complete. Total charged: {{total}}. Thanks!",
  },
  {
    key: "job_complete_credit",
    label: "Job complete (paid by credit)",
    description: "Sent on job completion when account credit covered the full amount.",
    audience: "customer",
    variables: [],
    defaultBody:
      "Your Book My Tech job is complete — paid in full with your account credit. Thanks!",
  },
  {
    key: "booking_cancelled_fee",
    label: "Booking cancelled (fee charged)",
    description: "Sent when a booking is cancelled and a cancellation fee was taken.",
    audience: "customer",
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
    audience: "customer",
    variables: [],
    defaultBody:
      "Your Book My Tech booking is cancelled. Your full pre-authorisation has been released.",
  },
  {
    key: "message_fallback",
    label: "New message from mechanic",
    description: "Sent immediately when a mechanic messages the customer and we hold their number.",
    audience: "customer",
    variables: [
      { name: "preview", description: "First ~120 chars of the message", example: "Running 10 mins late, sorry!" },
    ],
    defaultBody:
      'Your Book My Tech mechanic sent you a message: "{{preview}}". Reply in your dashboard.',
  },
  {
    key: "message_nudge",
    label: "Unread message nudge",
    description: "Sent by the sweep when a message stays unread for ~5 minutes (customer or mechanic).",
    audience: "customer",
    variables: [],
    defaultBody:
      "You have an unread message on your Book My Tech booking. Open your dashboard to reply.",
  },
  {
    key: "reminder",
    label: "Service reminder",
    description: "Sent for scheduled reminders (MOT due, annual service, etc.) when the customer opts into SMS.",
    audience: "customer",
    variables: [
      { name: "label", description: "Reminder name", example: "MOT due" },
      { name: "vehicle_reg", description: "Vehicle registration", example: "AB12 CDE" },
      { name: "cta", description: "Suggested action", example: "book your MOT" },
      { name: "url", description: "Link to act on it", example: "https://bookmytech.co.uk/book" },
    ],
    defaultBody: "{{label}} for {{vehicle_reg}}: {{cta}} — {{url}}",
  },

  // --- Mechanic ---------------------------------------------------------------
  {
    key: "mech_job_cancelled",
    label: "Customer cancelled the job",
    description: "Sent to the mechanic when the customer cancels a job they had accepted.",
    audience: "mechanic",
    variables: [
      { name: "ref", description: "Job number", example: "00123" },
    ],
    defaultBody:
      "Book My Tech: the customer has cancelled job {{ref}}. It's been removed from your schedule.",
  },
  {
    key: "mech_booking_rescheduled",
    label: "Customer moved the job",
    description: "Sent to the mechanic when the customer reschedules a job they had accepted.",
    audience: "mechanic",
    variables: [
      { name: "ref", description: "Job number", example: "00123" },
      { name: "slot", description: "The new date/time", example: "Thu 4 Sep · 14:00" },
    ],
    defaultBody:
      "Book My Tech: the customer moved job {{ref}} to {{slot}}. Check your schedule.",
  },
  {
    key: "mech_reschedule_accepted",
    label: "Customer accepted your new time",
    description: "Sent to the mechanic when the customer accepts the time they proposed.",
    audience: "mechanic",
    variables: [
      { name: "ref", description: "Job number", example: "00123" },
      { name: "slot", description: "The agreed date/time", example: "Thu 4 Sep · 14:00" },
    ],
    defaultBody:
      "Book My Tech: the customer accepted your new time for job {{ref}} — it's now {{slot}}.",
  },
  {
    key: "mech_reschedule_declined",
    label: "Customer declined your new time",
    description: "Sent to the mechanic when the customer declines the time they proposed.",
    audience: "mechanic",
    variables: [
      { name: "ref", description: "Job number", example: "00123" },
      { name: "original", description: "The time the job stays at", example: "Wed 3 Sep · 8am–10am" },
    ],
    defaultBody:
      "Book My Tech: the customer declined your proposed time for job {{ref}}. It stays at {{original}}.",
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

/**
 * Transliterate the typographic characters our copy and labels use into their
 * GSM-7 equivalents so a text stays at 160 characters per segment. Applied to
 * the final body by `sendSms`, and to the editor preview so admins see what
 * will actually go out. Anything not listed passes through untouched.
 */
export function gsmFriendly(body: string): string {
  return body
    .replace(/[–—]/g, "-") // en dash, em dash
    .replace(/\s*·\s*/g, ", ") // middle dot separator ("Wed 3 Sep · 8am")
    .replace(/[‘’]/g, "'") // curly single quotes
    .replace(/[“”]/g, '"') // curly double quotes
    .replace(/…/g, "..."); // ellipsis
}
