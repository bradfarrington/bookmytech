// Mechanic recruitment copy shared by /mechanics and /mechanics/[area-slug]
// (Task 46), so the two pages can't drift. Every line must stay true of the
// product and the mechanic agreement:
//   - dispatch: a booking is offered to every eligible online mechanic in
//     radius; the first to accept takes it (lib/dispatch/dispatch.ts)
//   - money: the customer's card is pre-authorised, captured on completion and
//     paid out to the mechanic's connected account (lib/payments/payout.ts)
//   - fees: free to apply, no monthly or lead fees, a service fee on completed
//     jobs. The rate is admin-editable, so it is never quoted.
//   - checks: ID, insurance and qualifications are checked by the admin team.
//     No DBS checks, and nothing is verified "with the issuing bodies".

import {
  BadgeCheck,
  BadgePercent,
  CalendarClock,
  ClipboardCheck,
  MapPin,
  PoundSterling,
  Radio,
  Rocket,
  ShieldCheck,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AccordionItem } from "@/components/ui/accordion";
import type { TickerFact } from "@/components/ui/fact-ticker";
import type { TimelineStep } from "@/components/ui/steps-timeline";

const APPLY_START = "/mechanics/apply/step-1";

/** The application, tagged to an area when the visitor came from its recruitment page. */
export function applyHref(areaSlug?: string): string {
  return areaSlug ? `${APPLY_START}?area=${encodeURIComponent(areaSlug)}` : APPLY_START;
}

export const MECHANIC_FACTS: TickerFact[] = [
  { icon: BadgePercent, value: "Free to apply", label: "no monthly fees" },
  { icon: Radio, value: "No lead charges", label: "a service fee on completed jobs only" },
  { icon: CalendarClock, value: "Your hours", label: "go online when it suits you" },
  { icon: MapPin, value: "Your radius", label: "only jobs inside it" },
  { icon: Wallet, value: "Paid out", label: "when you complete the job" },
  { icon: ShieldCheck, value: "Live in four regions", label: "London, Midlands, North West, South West" },
];

export const MECHANIC_BENEFITS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: PoundSterling,
    title: "Keep more of every job",
    body: "Jobs are priced up front and payment comes to your account. No chasing invoices, no cash handling.",
  },
  {
    icon: CalendarClock,
    title: "Work on your terms",
    body: "Set your own hours, radius and specialisms. Go online when you want and accept only the jobs that suit you.",
  },
  {
    icon: MapPin,
    title: "Jobs come to you",
    body: "We send you bookings near you and bring the customers: no marketing, no quoting, no time-wasters.",
  },
  {
    icon: Smartphone,
    title: "Everything on your phone",
    body: "Job details, customer messages, photos, parts and payment, all in the mechanic app.",
  },
  {
    icon: Wallet,
    title: "Paid when the job's done",
    body: "Payment is pre-authorised before you arrive and paid out when you mark the job complete.",
  },
  {
    icon: ShieldCheck,
    title: "Backed by our team",
    body: "Dispute support from Book My Tech on every job, so you're never on your own.",
  },
];

export const MECHANIC_STEPS: TimelineStep[] = [
  {
    icon: ClipboardCheck,
    title: "Apply online.",
    description:
      "Tell us about yourself, your business, your specialisms and your area. Takes about 10 minutes.",
  },
  {
    icon: BadgeCheck,
    title: "Get checked.",
    description: "Our team checks your ID, insurance and qualifications, usually within a few days.",
  },
  {
    icon: Rocket,
    title: "Go live and earn.",
    description: "Set your availability in the mechanic app and start accepting jobs near you.",
  },
];

export const MECHANIC_REQUIREMENTS = [
  "Photo ID (passport or driving licence)",
  "Public liability and trade insurance",
  "A recognised trade qualification (e.g. NVQ Level 2/3, City & Guilds)",
  "Your own tools and a reliable vehicle",
  "Two references",
  "A smartphone to run the mechanic app",
];

export const MECHANIC_FAQS: AccordionItem[] = [
  {
    question: "How much does it cost to join?",
    answer:
      "Applying is free. There are no monthly fees and no charges for leads. We take a transparent service fee per completed job, so you only ever pay when you earn.",
  },
  {
    question: "How and when do I get paid?",
    answer:
      "The customer's payment is pre-authorised before the job. Once you mark the work complete, the payout goes to your connected account, with no invoicing or chasing.",
  },
  {
    question: "Do I have to work set hours?",
    answer:
      "No. You set your own availability and service radius and go online whenever you like. Accept the jobs that suit you and ignore the ones that don't.",
  },
  {
    question: "What area will I cover?",
    answer:
      "You choose your base area and how far you're willing to travel during your application. We only send you jobs inside that radius.",
  },
  {
    question: "What do I need to get verified?",
    answer:
      "Photo ID, valid public liability and trade insurance, a recognised trade qualification and two references. Our team checks these as part of your application.",
  },
  {
    question: "How long does approval take?",
    answer:
      "Most applications are reviewed within a few working days once we have all your documents. We'll keep you updated by email at every step.",
  },
];
