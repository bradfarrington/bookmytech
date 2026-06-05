// Reminder domain constants — kept in a plain (non "server-only") module so
// both the pure derive logic, the cron routes, the email template, and the
// client preferences UI can import the labels/copy without pulling in the
// service-role graph.

export const REMINDER_TYPES = [
  "mot_due",
  "annual_service",
  "winter_battery",
  "summer_aircon",
  "brake_check",
] as const;

export type ReminderType = (typeof REMINDER_TYPES)[number];

interface ReminderMeta {
  /** Short label for dashboards / admin. */
  label: string;
  /** Email subject line. */
  subject: string;
  /** One-line nudge body (the "why now"). */
  blurb: string;
  /** CTA button label. */
  cta: string;
  /** Service slug the reminder suggests booking (must exist in `services`). */
  suggestionSlug: string;
}

// Suggestion slugs map to the seeded service slugs (see 0001_seed_services.sql).
// summer_aircon has no dedicated air-con service yet, so it suggests a
// diagnostic — revisit if an air-con regas service is added.
export const REMINDER_META: Record<ReminderType, ReminderMeta> = {
  mot_due: {
    label: "MOT due",
    subject: "Your MOT is due soon — book your pre-check",
    blurb:
      "Your MOT is coming up. Book a pre-check now and we'll catch anything that would fail before the test does.",
    cta: "Book your MOT pre-check",
    suggestionSlug: "mot-pre-check",
  },
  annual_service: {
    label: "Annual service",
    subject: "Time for your car's annual service",
    blurb:
      "It's been about a year since your last visit. A full service keeps your car reliable and protects its value.",
    cta: "Book a full service",
    suggestionSlug: "full-service",
  },
  winter_battery: {
    label: "Winter battery check",
    subject: "Cold weather's coming — get your battery checked",
    blurb:
      "Batteries fail most in winter. A quick check now means you won't get caught out on a frosty morning.",
    cta: "Book a battery check",
    suggestionSlug: "battery",
  },
  summer_aircon: {
    label: "Summer air-con check",
    subject: "Warmer days ahead — is your air-con ready?",
    blurb:
      "Air-con loses its bite over winter. Get it checked before the heat arrives so you stay cool on the road.",
    cta: "Book a check",
    suggestionSlug: "diagnostic",
  },
  brake_check: {
    label: "Brake follow-up",
    subject: "A quick brake check is due",
    blurb:
      "It's been six months since your brake work. A short follow-up makes sure everything's still wearing evenly.",
    cta: "Book a brake check",
    suggestionSlug: "brakes-tyres",
  },
};
