import { CalendarDays, MapPin, PoundSterling, ShieldCheck, type LucideIcon } from "lucide-react";
import type { AccordionItem } from "@/components/ui/accordion";

// The customer FAQs, shared by the public help page (app/(customer)/help) and
// the dashboard's Help centre (app/(customer)/dashboard/(shell)/help, Task 48),
// so the two can never say different things.

export type FaqGroup = {
  /** Anchor id, linked from the hero and the sidebar. */
  id: string;
  eyebrow: string;
  heading: string;
  icon: LucideIcon;
  items: AccordionItem[];
};

// Every answer must match the customer terms (app/(customer)/terms/content.ts)
// and the product. DBS checks were removed from the platform: never claim them.
export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "booking",
    eyebrow: "Getting started",
    heading: "Booking and appointments",
    icon: CalendarDays,
    items: [
      {
        question: "How do I book a mechanic?",
        answer:
          "Enter your registration on the homepage, pick the repair or service you need, choose a time slot, and confirm. Your job is sent to vetted mechanics nearby, and the one who accepts comes to you at home, work or the roadside.",
      },
      {
        question: "How quickly can someone come out?",
        answer:
          "You can book from an hour ahead, with 2-hour arrival windows between 8am and 8pm, or an all-day slot if you're flexible. You'll see the times available when you pick a slot.",
      },
      {
        question: "Where can the mechanic work on my car?",
        answer:
          "Anywhere it's safe and legal to: your driveway, a workplace car park, or the roadside. You choose the location when you book. Some jobs need a reasonably level, accessible spot; we'll flag it if so.",
      },
      {
        question: "Can I reschedule or cancel a booking?",
        answer:
          "Yes, from your dashboard. Rescheduling is free. Cancelling is free more than 24 hours before your slot; a fee applies closer to the time or once your mechanic is on the way. Our cancellation policy lists the current fees.",
      },
      {
        question: "What if I'm not at home when the mechanic arrives?",
        answer:
          "You (or someone who can authorise the work and give access to the vehicle) should be present at the start of the appointment. If your plans change, reschedule from your dashboard before the slot begins.",
      },
    ],
  },
  {
    id: "pricing",
    eyebrow: "Money",
    heading: "Pricing and payments",
    icon: PoundSterling,
    items: [
      {
        question: "Is the price I see the price I pay?",
        answer:
          "Yes, for the job you booked: parts, labour and call-out, with no hidden fees. If your mechanic finds the car needs something different, they'll send you the new price to approve before any extra work is done.",
      },
      {
        question: "Do I pay upfront?",
        answer:
          "No. We pre-authorise the payment when you book, which reserves the funds but doesn't charge you. You're only charged when your mechanic completes the job.",
      },
      {
        question: "What payment methods can I use?",
        answer:
          "We accept major debit and credit cards. Payments are processed securely by Stripe, and we don't store your full card details.",
      },
      {
        question: "What if the mechanic can't fix the problem?",
        answer:
          "A diagnostic inspection is a set price (from £59.99). Your mechanic finds the fault, tells you what it needs and quotes for the repair, and you decide whether to go ahead.",
      },
      {
        question: "How do refunds work?",
        answer:
          "If a booking is cancelled before any work is captured, the pre-authorisation is released in full. Where a refund is due after payment (for example, following a dispute), it's returned to your original payment method.",
      },
    ],
  },
  {
    id: "warranty",
    eyebrow: "Peace of mind",
    heading: "Warranty, vetting and disputes",
    icon: ShieldCheck,
    items: [
      {
        question: "How are mechanics vetted?",
        answer:
          "Every mechanic is vetted before they join Book My Tech. We check their ID, insurance and trade qualifications, a mechanic whose insurance lapses is taken offline until it's renewed, and we track quality through reviews.",
      },
      {
        question: "What does the 12-month warranty cover?",
        answer:
          "Eligible repairs are covered for defective parts or workmanship for 12 months or 12,000 miles, whichever comes first, subject to the exclusions in our terms (fair wear and tear, for example). Diagnostics and inspections aren't covered. If something isn't right, contact us and we'll look into it under the warranty.",
      },
      {
        question: "What if I'm not happy with the work?",
        answer:
          "Raise it from your dashboard within the confirmation window. Our support team will review the booking and can hold or reverse payment while we investigate. We aim to resolve disputes fairly and quickly.",
      },
      {
        question: "Are parts covered?",
        answer:
          "Yes. Parts fitted on an eligible repair are covered by the same 12-month warranty as the labour.",
      },
    ],
  },
  {
    id: "areas",
    eyebrow: "Coverage",
    heading: "Areas and vehicles",
    icon: MapPin,
    items: [
      {
        question: "What areas do you cover?",
        answer:
          "We're live across London, the Midlands, the North West and the South West. Add your postcode when you book and your job goes to vetted mechanics who cover your area.",
      },
      {
        question: "What vehicles can you work on?",
        answer:
          "Most cars. Enter your registration and we'll look up your make, model and engine and show you the repairs and services available for it.",
      },
      {
        question: "Do you do MOTs?",
        answer:
          "We don't carry out MOT tests. A service or any repairs your car needs can be booked with us before its test.",
      },
    ],
  },
];
