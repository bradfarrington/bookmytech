// Email template registry — single source of truth for the default subject,
// preheader, editable copy blocks, and merge variables of every email the
// platform sends. Admin edits are stored as overrides in `email_templates`
// (0031); a missing row / field falls back to the defaults here.
//
// Pure data module (no server imports) so the admin editor can import the defs.
// Dynamic, non-editable bits are `custom` blocks resolved by
// ./custom-renderers (server). Keep block ids stable — they key the overrides.

import type { EmailBlock } from "./blocks";

export type EmailCategory = "customer" | "mechanic" | "dispute" | "internal";

export interface EmailVariable {
  name: string;
  description: string;
  example: string;
}

export interface EmailTemplateDef {
  key: string;
  label: string;
  description: string;
  category: EmailCategory;
  /** Default subject line; supports {{tokens}}. */
  subject: string;
  /** Inbox preview text; supports {{tokens}}. */
  preheader?: string;
  variables: EmailVariable[];
  blocks: EmailBlock[];
}

export const EMAIL_TEMPLATE_DEFS: readonly EmailTemplateDef[] = [
  // ─── Mechanic onboarding ────────────────────────────────────────────────
  {
    key: "mechanic_invite",
    label: "Mechanic invite",
    description: "Sent when an admin invites a mechanic to set their password.",
    category: "mechanic",
    subject: "You've been invited to Book My Tech",
    preheader: "Your Book My Tech mechanic account is ready — sign in to get started.",
    variables: [
      { name: "name", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "action_link", description: "Set-password link", example: "https://bookmytech.co.uk/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Welcome to Book My Tech, {{name}}." },
      {
        id: "intro",
        type: "paragraph",
        text: "An admin has invited you to join Book My Tech as a vetted professional. Click the button below to set your password — then you'll sign in with your email and password to complete your profile.",
      },
      { id: "cta", type: "button", text: "Set your password", hrefVar: "action_link" },
      {
        id: "footnote",
        type: "note",
        text: "For your security this link expires soon. If you didn't expect this invite, you can ignore this email.",
      },
    ],
  },
  {
    key: "application_received",
    label: "Application received",
    description: "Sent to a mechanic the moment they submit their application.",
    category: "mechanic",
    subject: "We've received your Book My Tech application",
    preheader: "We've received your application — we'll review it within 48 hours.",
    variables: [{ name: "name", description: "Applicant's name", example: "Sam Rivera" }],
    blocks: [
      { id: "heading", type: "heading", text: "Thanks, {{name}} — we've got your application." },
      {
        id: "intro",
        type: "paragraph",
        text: "Your application to join Book My Tech as a vetted professional has been received. Our team will review your details and documents and get back to you **within 48 hours**.",
      },
      {
        id: "more",
        type: "paragraph",
        text: "There's nothing more you need to do right now. If we need anything else to complete your application, we'll email you with a link to supply it.",
      },
      { id: "footnote", type: "note", text: "Didn't apply? You can safely ignore this email." },
    ],
  },
  {
    key: "application_approved",
    label: "Application approved",
    description: "Sent when a mechanic application is approved (optionally with a grace period).",
    category: "mechanic",
    subject: "You're approved — welcome to Book My Tech",
    preheader: "You're approved — welcome to Book My Tech.",
    variables: [
      { name: "name", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "action_link", description: "Set-password link", example: "https://bookmytech.co.uk/…" },
      { name: "grace_ends_on", description: "Grace deadline (if approved with grace)", example: "5 August 2026" },
      { name: "grace_outstanding", description: "Outstanding docs, packed a|b|c (if any)", example: "Photo ID|Trade insurance" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "You're in, {{name}}. Welcome aboard." },
      {
        id: "intro",
        type: "paragraph",
        text: "Your application has been approved. Click below to set your password — then you'll sign in with your email and password to start receiving jobs near you.",
      },
      { id: "cta", type: "button", text: "Set your password", hrefVar: "action_link" },
      { id: "grace", type: "custom", render: "grace_block" },
      {
        id: "footnote",
        type: "note",
        text: "For your security this link expires soon. If it stops working, ask us to send a fresh one.",
      },
    ],
  },
  {
    key: "application_rejected",
    label: "Application rejected",
    description: "Sent when a mechanic application is declined.",
    category: "mechanic",
    subject: "Your Book My Tech application",
    preheader: "An update on your Book My Tech application.",
    variables: [
      { name: "name", description: "Applicant's name", example: "Sam Rivera" },
      { name: "reason", description: "Rejection reason", example: "Insurance certificate had expired." },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "An update on your application" },
      {
        id: "intro",
        type: "paragraph",
        text: "Hi {{name}}, thank you for your interest in joining Book My Tech. After reviewing your application, we're not able to approve it at this time.",
      },
      { id: "reason", type: "paragraph", text: "**Reason:** {{reason}}" },
      {
        id: "outro",
        type: "paragraph",
        text: "If you believe this was a mistake or your circumstances change, you're welcome to apply again or reply to this email.",
      },
    ],
  },
  {
    key: "application_needs_info",
    label: "Application needs info",
    description: "Sent when an admin requests more information on an application.",
    category: "mechanic",
    subject: "Action needed on your Book My Tech application",
    preheader: "We need a little more to finish reviewing your application.",
    variables: [
      { name: "name", description: "Applicant's name", example: "Sam Rivera" },
      { name: "note", description: "What's needed", example: "A clearer photo of your ID." },
      { name: "resubmit_link", description: "Secure resubmit link", example: "https://bookmytech.co.uk/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "We need a bit more, {{name}}" },
      {
        id: "intro",
        type: "paragraph",
        text: "We're almost there with your application — we just need the following before we can finish our review:",
      },
      { id: "note", type: "paragraph", text: "{{note}}" },
      { id: "cta", type: "button", text: "Supply what's needed", hrefVar: "resubmit_link" },
      {
        id: "footnote",
        type: "note",
        text: "This is a secure link unique to your application — don't share it.",
      },
    ],
  },
  {
    key: "document_expiring",
    label: "Document expiring soon",
    description: "Reminder that a mechanic document is due to expire (30/7/0 days out).",
    category: "mechanic",
    subject: "Your {{doc}} is expiring soon",
    preheader: "Your {{doc}} is expiring soon — upload a renewed copy.",
    variables: [
      { name: "doc", description: "Document name", example: "Public liability insurance" },
      { name: "documents_link", description: "Link to documents page", example: "https://bookmytech.co.uk/mechanic/documents" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Your {{doc}} is expiring soon" },
      {
        id: "body",
        type: "paragraph",
        text: "Your {{doc}} is due to expire soon. Please upload a renewed copy to avoid any interruption to the jobs you're offered.",
      },
      { id: "cta", type: "button", text: "Upload renewed document", hrefVar: "documents_link" },
    ],
  },
  {
    key: "document_expired",
    label: "Document expired",
    description: "Sent when a mechanic document has expired (may take them offline).",
    category: "mechanic",
    subject: "Your {{doc}} has expired",
    preheader: "Your {{doc}} has expired — upload a current copy to get back online.",
    variables: [
      { name: "doc", description: "Document name", example: "Public liability insurance" },
      { name: "documents_link", description: "Link to documents page", example: "https://bookmytech.co.uk/mechanic/documents" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Your {{doc}} has expired" },
      {
        id: "body",
        type: "paragraph",
        text: "Your {{doc}} on file has expired, so you've been taken offline and won't receive new jobs until it's renewed. Upload a current copy to get back online.",
      },
      { id: "cta", type: "button", text: "Upload renewed document", hrefVar: "documents_link" },
    ],
  },
  {
    key: "grace_period_reminder",
    label: "Grace period reminder",
    description: "Reminds a grace-approved mechanic to supply outstanding docs before the deadline.",
    category: "mechanic",
    subject: "Time to upload your documents",
    preheader: "Upload your outstanding documents before your grace period ends.",
    variables: [
      { name: "name", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "day_line", description: "Days-left phrase", example: "7 days left" },
      { name: "ends_on", description: "Grace deadline", example: "5 August 2026" },
      { name: "outstanding", description: "Outstanding docs, packed a|b|c", example: "Photo ID|Trade insurance" },
      { name: "documents_link", description: "Link to documents page", example: "https://bookmytech.co.uk/mechanic/documents" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "{{name}}, {{day_line}} to finish your paperwork" },
      {
        id: "body",
        type: "paragraph",
        text: "You were approved with a 28-day window to supply your outstanding documents. Please upload them by **{{ends_on}}** — after that your account is paused and you'll stop receiving new jobs until they're on file.",
      },
      { id: "still", type: "paragraph", text: "**Still needed:**" },
      { id: "list", type: "custom", render: "outstanding_list" },
      { id: "cta", type: "button", text: "Upload documents", hrefVar: "documents_link" },
    ],
  },

  // ─── Customer lifecycle ─────────────────────────────────────────────────
  {
    key: "password_reset",
    label: "Password reset",
    description:
      "Sent when a customer asks for a new password — from /login or the booking funnel's sign-in prompt.",
    category: "customer",
    subject: "Set a new Book My Tech password",
    preheader: "Use the link inside to choose a new password.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "action_link", description: "Set-password link", example: "https://bookmytech.co.uk/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Choose a new password" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      {
        id: "intro",
        type: "paragraph",
        text: "You asked to reset the password on your Book My Tech account. Click the button below to choose a new one — you'll be signed in straight away.",
      },
      { id: "cta", type: "button", text: "Set a new password", hrefVar: "action_link" },
      {
        id: "footnote",
        type: "note",
        text: "For your security this link expires soon and can only be used once. If you didn't ask for this, you can safely ignore this email — your password won't change.",
      },
    ],
  },
  {
    key: "booking_confirmed",
    label: "Booking received",
    description: "Sent to the customer when a booking is created, while we find a mechanic.",
    category: "customer",
    subject: "Booking received — we're finding your mechanic",
    preheader: "We've received your booking — we're finding your mechanic.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "ref", description: "Short booking reference", example: "A1B2C3D4" },
      { name: "service", description: "Service booked", example: "Full service" },
      { name: "vehicle", description: "Vehicle description", example: "AB12 CDE — Ford Focus" },
      { name: "when", description: "Scheduled date/time", example: "Monday 3 August · 8am–10am" },
      { name: "pay_line", description: "Payment summary line", example: "Amount pre-authorised: £120.00" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Your booking is confirmed!" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      {
        id: "intro",
        type: "paragraph",
        text: "We've received your booking and are now matching you with the best available mechanic in your area. You'll hear from us as soon as one accepts — usually within minutes.",
      },
      { id: "summary", type: "custom", render: "booking_summary" },
      { id: "pay", type: "paragraph", text: "**{{pay_line}}**" },
      {
        id: "holdnote",
        type: "note",
        text: "No money has left your account yet. Your payment will only be captured once the job is complete and you've signed off.",
      },
      {
        id: "help",
        type: "note",
        text: "Questions? Email us at [help@bookmytech.co.uk](mailto:help@bookmytech.co.uk)",
      },
    ],
  },
  {
    key: "booking_en_route",
    label: "Mechanic on the way",
    description: "Sent to the customer when the mechanic marks themselves en route.",
    category: "customer",
    subject: "Your mechanic is on the way",
    preheader: "Your mechanic has set off and is heading to you now.",
    variables: [{ name: "name", description: "Customer's name", example: "Alex" }],
    blocks: [
      { id: "heading", type: "heading", text: "Your mechanic is on the way" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      {
        id: "body",
        type: "paragraph",
        text: "Your mechanic has set off and is heading to you now. Please make sure your vehicle is accessible.",
      },
      {
        id: "footnote",
        type: "note",
        text: "Track your booking from your confirmation page for live status updates.",
      },
    ],
  },
  {
    key: "job_complete",
    label: "Job complete — receipt",
    description: "Sent to the customer when the mechanic marks the job complete.",
    category: "customer",
    subject: "Your job is complete — receipt",
    preheader: "All done — here's your receipt.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "service", description: "Service completed", example: "Full service" },
      { name: "credit_line", description: "Optional total·credit line", example: "Service total £120.00 · account credit −£20.00" },
      { name: "charge_line", description: "Headline charge line", example: "Total charged: £100.00" },
      { name: "settle_line", description: "Settlement status line", example: "Your card has now been charged." },
      { name: "review_url", description: "Review link", example: "https://bookmytech.co.uk/review/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "All done — thanks for using Book My Tech" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      { id: "body", type: "paragraph", text: "Your mechanic has marked **{{service}}** complete." },
      { id: "credit", type: "custom", render: "receipt_credit" },
      { id: "charge", type: "paragraph", text: "**{{charge_line}}**" },
      { id: "settle", type: "note", text: "{{settle_line}}" },
      { id: "review", type: "custom", render: "review_stars" },
    ],
  },
  {
    key: "booking_cancelled",
    label: "Booking cancelled (customer)",
    description: "Sent to the customer confirming their cancellation.",
    category: "customer",
    subject: "Your booking has been cancelled",
    preheader: "Your booking has been cancelled as requested.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "fee_line", description: "Cancellation fee / release line", example: "No cancellation fee applied — your full pre-authorisation has been released." },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Booking cancelled" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      { id: "body", type: "paragraph", text: "Your booking has been cancelled as requested." },
      { id: "fee", type: "paragraph", text: "**{{fee_line}}**" },
      { id: "footnote", type: "note", text: "Released holds can take a few days to clear with your bank." },
    ],
  },
  {
    key: "booking_rescheduled",
    label: "Booking rescheduled (customer)",
    description: "Sent to the customer confirming a new booking time.",
    category: "customer",
    subject: "Your booking has been rescheduled",
    preheader: "Your booking has a new time.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "slot", description: "New date/time", example: "Wednesday 5 August · 10am–12pm" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "New time confirmed" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      { id: "body", type: "paragraph", text: "Your booking is now set for **{{slot}}**." },
      { id: "footnote", type: "note", text: "Your pre-authorisation stays in place — no new charge." },
    ],
  },
  {
    key: "mechanic_confirmed",
    label: "Mechanic confirmed",
    description: "Sent to the customer when a mechanic accepts their booking.",
    category: "customer",
    subject: "Your mechanic is confirmed",
    preheader: "Your mechanic has accepted your booking.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "mechanic", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "service", description: "Service booked", example: "Full service" },
      { name: "when", description: "Scheduled date/time", example: "Mon 3 Aug · 8am–10am" },
      {
        name: "optional_note",
        description: "Extra line, only for all-day bookings (the mechanic will narrow the window)",
        example: "",
      },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Your mechanic is confirmed" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      { id: "intro", type: "paragraph", text: "**{{mechanic}}** has accepted your booking." },
      { id: "summary", type: "custom", render: "booking_summary" },
      { id: "window_note", type: "custom", render: "optional_note" },
      { id: "next", type: "note", text: "We'll let you know the moment they set off." },
      { id: "track", type: "note", text: "Track your booking any time from your account." },
    ],
  },
  {
    key: "replacement_confirmed",
    label: "Replacement mechanic confirmed",
    description: "Sent to the customer when a replacement mechanic takes over the job.",
    category: "customer",
    subject: "Good news — your replacement mechanic is confirmed",
    preheader: "We've found your replacement mechanic.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "mechanic", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "service", description: "Service booked", example: "Full service" },
      { name: "when", description: "Scheduled date/time", example: "Mon 3 Aug · 8am–10am" },
      {
        name: "optional_note",
        description: "Extra line, only for all-day bookings (the mechanic will narrow the window)",
        example: "",
      },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "We've found your replacement mechanic" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      {
        id: "intro",
        type: "paragraph",
        text: "Thanks for your patience — **{{mechanic}}** has accepted your job and will be taking over.",
      },
      { id: "summary", type: "custom", render: "booking_summary" },
      { id: "window_note", type: "custom", render: "optional_note" },
      { id: "hold", type: "note", text: "Your existing pre-authorisation stays in place — no new charge." },
      { id: "track", type: "note", text: "Track your booking any time from your account." },
    ],
  },
  {
    key: "arrival_window_confirmed",
    label: "Arrival window confirmed",
    description:
      "Sent to the customer when their mechanic narrows an all-day booking down to a 2-hour arrival window.",
    category: "customer",
    subject: "Your mechanic will arrive {{window}}",
    preheader: "{{mechanic}} has confirmed a 2-hour arrival window for your booking.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "mechanic", description: "Mechanic's name", example: "Sam Rivera" },
      { name: "service", description: "Service booked", example: "Brake pads" },
      { name: "ref", description: "Booking reference", example: "00123" },
      { name: "when", description: "Day and window", example: "Wed 3 Sep · 10am–12pm" },
      { name: "window", description: "Just the window", example: "10am–12pm" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Your arrival window is confirmed" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      {
        id: "intro",
        type: "paragraph",
        text: "You booked an all-day slot. **{{mechanic}}** has now confirmed they'll arrive between **{{window}}**.",
      },
      { id: "summary", type: "custom", render: "booking_summary" },
      {
        id: "hold",
        type: "note",
        text: "Nothing else about your booking has changed — your pre-authorisation stays in place.",
      },
      { id: "track", type: "note", text: "Track your booking any time from your account." },
    ],
  },
  {
    key: "finding_replacement",
    label: "Finding a replacement",
    description: "Sent to the customer when their mechanic cancels and we source a replacement.",
    category: "customer",
    subject: "Update on your booking — finding you a replacement mechanic",
    preheader: "We're finding you a replacement mechanic.",
    variables: [{ name: "name", description: "Customer's name", example: "Alex" }],
    blocks: [
      { id: "heading", type: "heading", text: "We're finding you a replacement" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      {
        id: "body",
        type: "paragraph",
        text: "Your original mechanic has had to cancel. We're sorry for the disruption — we're already finding you a suitable replacement and will confirm as soon as one accepts, usually within minutes.",
      },
      {
        id: "hold",
        type: "note",
        text: "No money has left your account. Your existing pre-authorisation stays in place and simply transfers to your new mechanic.",
      },
      { id: "help", type: "note", text: "Questions? Email us at [help@bookmytech.co.uk](mailto:help@bookmytech.co.uk)" },
    ],
  },
  {
    key: "mechanic_proposed_time",
    label: "Mechanic proposed a new time",
    description: "Sent to the customer when their mechanic proposes moving the booking.",
    category: "customer",
    subject: "Your mechanic has proposed a new time",
    preheader: "Your mechanic has proposed a new time for your booking.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "slot", description: "Proposed date/time", example: "Wednesday 5 August, 2:00pm" },
      { name: "optional_note", description: "Mechanic's note (if any)", example: 'Note from your mechanic: "Running behind on another job."' },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "A new time has been proposed" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      { id: "body", type: "paragraph", text: "Your mechanic has proposed moving your booking to:" },
      { id: "slot", type: "paragraph", text: "**{{slot}}**" },
      { id: "note", type: "custom", render: "optional_note" },
      {
        id: "next",
        type: "note",
        text: "We'll be in touch shortly so you can accept this time, suggest another, or keep your original slot.",
      },
      { id: "help", type: "note", text: "Questions? Email us at [help@bookmytech.co.uk](mailto:help@bookmytech.co.uk)" },
    ],
  },
  {
    key: "reminder",
    label: "Service reminder",
    description: "Sent for scheduled reminders (MOT due, service, etc.). Per-type copy comes from merge tags.",
    category: "customer",
    subject: "{{subject}}",
    preheader: "{{subject}}",
    variables: [
      { name: "subject", description: "Per-type subject", example: "Your MOT is due soon" },
      { name: "label", description: "Reminder label", example: "MOT due" },
      { name: "reg", description: "Vehicle registration", example: "AB12 CDE" },
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "blurb", description: "Per-type body copy", example: "Your MOT is due next month." },
      { name: "cta", description: "Call-to-action label", example: "Book your MOT" },
      { name: "cta_url", description: "Action link", example: "https://bookmytech.co.uk/r/…" },
      { name: "prefs_url", description: "Manage-reminders link", example: "https://bookmytech.co.uk/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "{{label}} — {{reg}}" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      { id: "body", type: "paragraph", text: "{{blurb}}" },
      { id: "cta", type: "button", text: "{{cta}}", hrefVar: "cta_url" },
      {
        id: "footnote",
        type: "note",
        text: "Not the right time? You can [manage your reminders]({{prefs_url}}) or turn them off any time.",
      },
    ],
  },

  // ─── Internal alerts ────────────────────────────────────────────────────
  {
    key: "admin_new_application",
    label: "Admin: new application alert",
    description: "Internal alert to ops when a new mechanic application lands.",
    category: "internal",
    subject: "New mechanic application — {{applicant_name}}",
    preheader: "New mechanic application from {{applicant_name}} ({{postcode}}).",
    variables: [
      { name: "applicant_name", description: "Applicant's name", example: "Sam Rivera" },
      { name: "postcode", description: "Applicant postcode", example: "M1 2AB" },
      { name: "specialism_count", description: "Number of specialisms", example: "3" },
      { name: "review_link", description: "Approvals queue link", example: "https://bookmytech.co.uk/admin/approvals" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "New mechanic application" },
      { id: "intro", type: "paragraph", text: "**{{applicant_name}}** has applied to join the network." },
      {
        id: "details",
        type: "paragraph",
        text: "Postcode: **{{postcode}}** · Specialisms selected: **{{specialism_count}}**",
      },
      { id: "cta", type: "button", text: "Review application", hrefVar: "review_link" },
      { id: "footnote", type: "note", text: "Target turnaround is 48 hours from submission." },
    ],
  },
  {
    key: "low_sms_credits",
    label: "Admin: low SMS credits",
    description: "Internal alert when the SMS credit balance drops to the low threshold.",
    category: "internal",
    subject: "Low SMS credits — {{balance}} {{plural}} remaining",
    preheader: "Only {{balance}} SMS {{plural}} left — top up to keep notifications sending.",
    variables: [
      { name: "balance", description: "Credits remaining", example: "8" },
      { name: "plural", description: '"credit" or "credits"', example: "credits" },
      { name: "settings_url", description: "SMS settings link", example: "https://bookmytech.co.uk/admin/sms" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Low SMS credits" },
      {
        id: "intro",
        type: "paragraph",
        text: "Your Book My Tech SMS balance has dropped to **{{balance}} {{plural}}**.",
      },
      { id: "panel", type: "custom", render: "low_credit_balance" },
      {
        id: "body",
        type: "paragraph",
        text: "Once credits reach zero, SMS notifications (booking updates, reminders, message nudges) stop sending until you top up. Email still goes out as normal.",
      },
      { id: "cta", type: "button", text: "Buy more credits", hrefVar: "settings_url" },
    ],
  },
  // ─── Mechanic job notices ───────────────────────────────────────────────
  {
    key: "mechanic_reschedule_accepted",
    label: "Reschedule accepted (to mechanic)",
    description: "Sent to the mechanic when the customer accepts their proposed new time.",
    category: "mechanic",
    subject: "Your reschedule was accepted",
    preheader: "The customer accepted your proposed time.",
    variables: [{ name: "proposed", description: "New confirmed time", example: "Wednesday 5 August, 2:00pm" }],
    blocks: [
      { id: "heading", type: "heading", text: "New time confirmed" },
      {
        id: "body",
        type: "paragraph",
        text: "The customer accepted your proposed time. This job is now booked for **{{proposed}}**.",
      },
      { id: "footnote", type: "note", text: "View it on your dashboard." },
    ],
  },
  {
    key: "mechanic_reschedule_declined",
    label: "Reschedule declined (to mechanic)",
    description: "Sent to the mechanic when the customer keeps the original time.",
    category: "mechanic",
    subject: "Your reschedule was declined",
    preheader: "The customer kept their original time.",
    variables: [{ name: "original", description: "Original slot", example: "Monday 3 August, 9:00am" }],
    blocks: [
      { id: "heading", type: "heading", text: "Customer kept the original time" },
      {
        id: "body",
        type: "paragraph",
        text: "The customer declined the new time. The job stays at its original slot of **{{original}}**.",
      },
      { id: "footnote", type: "note", text: "View it on your dashboard." },
    ],
  },
  {
    key: "mechanic_job_cancelled",
    label: "Job cancelled (to mechanic)",
    description: "Sent to the assigned mechanic when the customer cancels.",
    category: "mechanic",
    subject: "A job was cancelled by the customer",
    preheader: "A booking was cancelled by the customer.",
    variables: [],
    blocks: [
      { id: "heading", type: "heading", text: "Job cancelled" },
      { id: "body", type: "paragraph", text: "The customer cancelled their booking. It's been removed from your jobs." },
    ],
  },
  {
    key: "mechanic_booking_rescheduled",
    label: "Booking moved (to mechanic)",
    description: "Sent to the assigned mechanic when the customer moves the booking.",
    category: "mechanic",
    subject: "A customer moved their booking",
    preheader: "A customer moved their booking to a new time.",
    variables: [{ name: "slot", description: "New date/time", example: "Wednesday 5 August, 2:00pm" }],
    blocks: [
      { id: "heading", type: "heading", text: "Booking rescheduled" },
      {
        id: "body",
        type: "paragraph",
        text: "The customer moved their booking to **{{slot}}**. If that no longer works for you, you can propose another time or release the job from your dashboard.",
      },
    ],
  },
  {
    key: "mechanic_suspended",
    label: "Account suspended",
    description: "Sent to a mechanic when their account is suspended from dispatch.",
    category: "mechanic",
    subject: "Your Book My Tech account has been suspended",
    preheader: "Your Book My Tech account has been suspended.",
    variables: [
      { name: "until_line", description: "Suspension duration line", example: "Your account is suspended pending review." },
      { name: "reason", description: "Suspension reason", example: "Outstanding onboarding documents." },
      { name: "dashboard_url", description: "Dashboard link", example: "https://bookmytech.co.uk/mechanic" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Account suspended" },
      { id: "until", type: "paragraph", text: "{{until_line}}" },
      { id: "reason", type: "paragraph", text: "**Reason:** {{reason}}" },
      {
        id: "body",
        type: "paragraph",
        text: "While suspended you won't receive new job offers. If you have questions, reply to this email or contact [help@bookmytech.co.uk](mailto:help@bookmytech.co.uk).",
      },
      { id: "footnote", type: "note", text: "[Open your dashboard →]({{dashboard_url}})" },
    ],
  },
  {
    key: "mechanic_suspension_lifted",
    label: "Suspension lifted",
    description: "Sent to a mechanic when their suspension is lifted.",
    category: "mechanic",
    subject: "Your Book My Tech account is active again",
    preheader: "You're back online — your suspension has been lifted.",
    variables: [
      { name: "dashboard_url", description: "Dashboard link", example: "https://bookmytech.co.uk/mechanic" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "You're back online" },
      {
        id: "body",
        type: "paragraph",
        text: "Your suspension has been lifted — you'll start receiving job offers again once you go online.",
      },
      { id: "footnote", type: "note", text: "[Open your dashboard →]({{dashboard_url}})" },
    ],
  },
  // ─── Disputes ───────────────────────────────────────────────────────────
  {
    key: "dispute_opened_admin",
    label: "Dispute opened (admin alert)",
    description: "Internal alert to ops when either party opens a dispute.",
    category: "dispute",
    subject: "New dispute opened — booking {{ref}}",
    preheader: "A dispute has been opened.",
    variables: [
      { name: "opener_role", description: "Who opened it", example: "customer" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "link", description: "Admin dispute link", example: "https://bookmytech.co.uk/admin/disputes/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "A dispute has been opened" },
      { id: "body", type: "paragraph", text: "The {{opener_role}} opened a dispute on **{{service}}** (ref {{ref}})." },
      { id: "advice", type: "note", text: "Monitor it and step in only if the parties can't resolve it themselves." },
      { id: "link", type: "paragraph", text: "[Open the dispute →]({{link}})" },
    ],
  },
  {
    key: "dispute_opened_mechanic",
    label: "Dispute opened (to mechanic)",
    description: "Sent to the mechanic when a customer opens a dispute.",
    category: "dispute",
    subject: "A customer raised an issue — booking {{ref}}",
    preheader: "A customer has opened a dispute on your job.",
    variables: [
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "link", description: "Mechanic dispute link", example: "https://bookmytech.co.uk/mechanic/disputes/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "A customer raised an issue" },
      {
        id: "body",
        type: "paragraph",
        text: "The customer on **{{service}}** (ref {{ref}}) has opened a dispute. Please add your account so we can resolve it quickly.",
      },
      { id: "link", type: "paragraph", text: "[Respond to the dispute →]({{link}})" },
      { id: "note", type: "note", text: "Your payout for this job is paused until the dispute is resolved." },
    ],
  },
  {
    key: "dispute_opened_customer",
    label: "Dispute opened (to customer)",
    description: "Sent to the customer when their mechanic opens a dispute.",
    category: "dispute",
    subject: "Your mechanic raised an issue — booking {{ref}}",
    preheader: "Your mechanic has opened a dispute.",
    variables: [
      { name: "name", description: "Customer's name", example: "Alex" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "link", description: "Customer dispute link", example: "https://bookmytech.co.uk/dashboard/disputes/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Your mechanic raised an issue" },
      { id: "greeting", type: "paragraph", text: "Hi {{name}}," },
      {
        id: "body",
        type: "paragraph",
        text: "Your mechanic has opened a dispute on **{{service}}** (ref {{ref}}). Please respond so we can sort it out.",
      },
      { id: "link", type: "paragraph", text: "[View the dispute →]({{link}})" },
    ],
  },
  {
    key: "dispute_responded_admin",
    label: "Dispute responded (admin alert)",
    description: "Internal alert when a party responds to a dispute.",
    category: "dispute",
    subject: "Dispute responded — booking {{ref}}",
    preheader: "A party responded to a dispute.",
    variables: [
      { name: "role", description: "Who responded", example: "mechanic" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "link", description: "Admin dispute link", example: "https://bookmytech.co.uk/admin/disputes/…" },
    ],
    blocks: [
      { id: "body", type: "paragraph", text: "The {{role}} responded to the dispute on {{service}}. [Review →]({{link}})" },
    ],
  },
  {
    key: "dispute_new_message_mechanic",
    label: "New dispute message (to mechanic)",
    description: "Nudges the mechanic when another party posts on the dispute.",
    category: "dispute",
    subject: "New message on a dispute — booking {{ref}}",
    preheader: "There's a new message on your dispute.",
    variables: [
      { name: "role", description: "Who posted", example: "customer" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "link", description: "Mechanic dispute link", example: "https://bookmytech.co.uk/mechanic/disputes/…" },
    ],
    blocks: [
      { id: "body", type: "paragraph", text: "The {{role}} posted a new message on the dispute for {{service}}. [Open the thread →]({{link}})" },
    ],
  },
  {
    key: "dispute_withdrawn_customer",
    label: "Dispute withdrawn (to customer)",
    description: "Sent to the customer when a dispute is withdrawn.",
    category: "dispute",
    subject: "Dispute closed — booking {{ref}}",
    preheader: "The dispute has been withdrawn and closed.",
    variables: [
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
    ],
    blocks: [
      { id: "body", type: "paragraph", text: "The dispute on {{service}} has been withdrawn and closed. No further action is needed." },
    ],
  },
  {
    key: "dispute_withdrawn_mechanic",
    label: "Dispute withdrawn (to mechanic)",
    description: "Sent to the mechanic when a dispute is withdrawn; their payout is unaffected.",
    category: "dispute",
    subject: "Dispute closed — booking {{ref}}",
    preheader: "The dispute has been withdrawn; your payout is unaffected.",
    variables: [
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
    ],
    blocks: [
      { id: "body", type: "paragraph", text: "The dispute on {{service}} has been withdrawn. Your payout for this job is unaffected." },
    ],
  },
  {
    key: "dispute_escalated_admin",
    label: "Dispute escalated (admin alert)",
    description: "Internal alert when a dispute is escalated for arbitration.",
    category: "dispute",
    subject: "Dispute escalated — booking {{ref}}",
    preheader: "A dispute needs arbitration.",
    variables: [
      { name: "role", description: "Who escalated", example: "customer" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "link", description: "Admin dispute link", example: "https://bookmytech.co.uk/admin/disputes/…" },
    ],
    blocks: [
      { id: "body", type: "paragraph", text: "A dispute on {{service}} was escalated by the {{role}} and needs arbitration. [Arbitrate →]({{link}})" },
    ],
  },
  {
    key: "dispute_escalated_mechanic",
    label: "Dispute escalated (to mechanic)",
    description: "Sent to the mechanic when the other party escalates the dispute.",
    category: "dispute",
    subject: "A dispute was escalated — booking {{ref}}",
    preheader: "A dispute was escalated to Book My Tech.",
    variables: [
      { name: "role", description: "Who escalated", example: "customer" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "link", description: "Mechanic dispute link", example: "https://bookmytech.co.uk/mechanic/disputes/…" },
    ],
    blocks: [
      { id: "body", type: "paragraph", text: "The {{role}} escalated the dispute on {{service}} to Book My Tech for arbitration. We'll review and let you know the outcome. [View →]({{link}})" },
    ],
  },
  {
    key: "dispute_resolved_customer",
    label: "Dispute resolved (to customer)",
    description: "Sent to the customer when an admin resolves their dispute.",
    category: "dispute",
    subject: "Your dispute has been resolved — booking {{ref}}",
    preheader: "Your dispute has been resolved.",
    variables: [
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "note", description: "Resolution note", example: "We've issued a partial refund as a goodwill gesture." },
      { name: "refund_line", description: "Refund line (if any)", example: "A refund of £30.00 has been issued to your card." },
      { name: "credit_line", description: "Credit line (if any)", example: "We've added £10.00 credit to your account." },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Dispute resolved" },
      { id: "note", type: "paragraph", text: "{{note}}" },
      { id: "amounts", type: "custom", render: "resolution_amounts" },
    ],
  },
  {
    key: "dispute_resolved_mechanic",
    label: "Dispute resolved (to mechanic)",
    description: "Sent to the mechanic when an admin resolves a dispute on their job.",
    category: "dispute",
    subject: "A dispute has been resolved — booking {{ref}}",
    preheader: "A dispute on your job has been resolved.",
    variables: [
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "decision", description: "Resolution decision", example: "Partial refund" },
      { name: "payout_line", description: "Payout outcome line", example: "Your payout for this job is unaffected." },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Dispute resolved" },
      {
        id: "body",
        type: "paragraph",
        text: "Book My Tech has reviewed the dispute on **{{service}}** and reached a decision: **{{decision}}**.",
      },
      { id: "payout", type: "paragraph", text: "{{payout_line}}" },
    ],
  },

  // ─── More internal alerts ───────────────────────────────────────────────
  {
    key: "dispatch_stall_alert",
    label: "Admin: bookings need a mechanic",
    description: "Internal alert when bookings go unaccepted past the stall threshold.",
    category: "internal",
    subject: "{{count}} booking(s) still need a mechanic",
    preheader: "Some bookings still need a mechanic.",
    variables: [
      { name: "count", description: "Number of stalled bookings", example: "3" },
      { name: "intro", description: "Summary line", example: "3 bookings have had no mechanic accept within 15 minutes." },
      { name: "bookings", description: "Packed ref·service·area·value rows", example: "A1B2 · Full service · M1 · £120.00" },
      { name: "link", description: "Bookings list link", example: "https://bookmytech.co.uk/admin/jobs" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Bookings awaiting a mechanic" },
      { id: "intro", type: "paragraph", text: "{{intro}} Review and hand-assign in the admin console." },
      { id: "list", type: "custom", render: "stall_list" },
      { id: "link", type: "note", text: "[Open the bookings list →]({{link}})" },
    ],
  },
  {
    key: "disputes_escalated_alert",
    label: "Admin: disputes auto-escalated",
    description: "Internal alert when disputes auto-escalate after the timeout.",
    category: "internal",
    subject: "{{count}} dispute(s) escalated for arbitration",
    preheader: "Disputes need your decision.",
    variables: [
      { name: "count", description: "Number escalated", example: "2" },
      { name: "intro", description: "Summary line", example: "2 disputes have auto-escalated after 48 hours without resolution." },
      { name: "link", description: "Disputes queue link", example: "https://bookmytech.co.uk/admin/disputes" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "Disputes need your decision" },
      { id: "intro", type: "paragraph", text: "{{intro}}" },
      { id: "link", type: "paragraph", text: "[Open the disputes queue →]({{link}})" },
    ],
  },

  // ─── Resolution Center (internal mechanic ↔ admin) ──────────────────────
  {
    key: "resolution_opened_admin",
    label: "Resolution case opened (admin alert)",
    description:
      "Internal alert to ops when a mechanic (or admin) raises a Resolution Center case about a job.",
    category: "internal",
    subject: "New resolution case — booking {{ref}}",
    preheader: "A resolution case has been opened.",
    variables: [
      { name: "opener_role", description: "Who opened it", example: "mechanic" },
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "reason", description: "Chosen reason", example: "Can't complete this job" },
      { name: "link", description: "Admin case link", example: "https://bookmytech.co.uk/admin/resolutions/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "A resolution case has been opened" },
      {
        id: "body",
        type: "paragraph",
        text: "The {{opener_role}} raised a case on **{{service}}** (ref {{ref}}).\n\nReason: **{{reason}}**",
      },
      { id: "link", type: "paragraph", text: "[Open the case →]({{link}})" },
    ],
  },
  {
    key: "resolution_opened_mechanic",
    label: "Resolution case opened (to mechanic)",
    description: "Sent to the mechanic when an admin raises a Resolution Center case about their job.",
    category: "mechanic",
    subject: "We've opened a case on your job — booking {{ref}}",
    preheader: "Book My Tech has opened a resolution case on your job.",
    variables: [
      { name: "service", description: "Service name", example: "Full service" },
      { name: "ref", description: "Booking reference", example: "A1B2C3D4" },
      { name: "reason", description: "Chosen reason", example: "Customer unreachable" },
      { name: "link", description: "Mechanic case link", example: "https://bookmytech.co.uk/mechanic/resolutions/…" },
    ],
    blocks: [
      { id: "heading", type: "heading", text: "We've opened a case on your job" },
      {
        id: "body",
        type: "paragraph",
        text: "Book My Tech has opened a resolution case on **{{service}}** (ref {{ref}}).\n\nReason: **{{reason}}**\n\nOpen the case to add your notes or ask a question.",
      },
      { id: "link", type: "paragraph", text: "[Open the case →]({{link}})" },
    ],
  },
];

export const EMAIL_TEMPLATE_BY_KEY: Record<string, EmailTemplateDef> = Object.fromEntries(
  EMAIL_TEMPLATE_DEFS.map((t) => [t.key, t]),
);
