import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageCircle,
  PoundSterling,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";
import { Footer } from "../_components/footer";

export const metadata: Metadata = {
  title: "Help & FAQ | Book My Tech",
  description:
    "Answers to common questions about booking a mobile mechanic, pricing, payments, warranty, areas and working with Book My Tech. Get in touch if you need a hand.",
};

type FaqGroup = {
  /** Anchor id, linked from the hero and the sidebar. */
  id: string;
  eyebrow: string;
  heading: string;
  icon: LucideIcon;
  items: AccordionItem[];
};

// Every answer must match the customer terms (app/(customer)/terms/content.ts)
// and the product. DBS checks were removed from the platform: never claim them.
const FAQ_GROUPS: FaqGroup[] = [
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
          "We're live across Greater London, Birmingham, Manchester and Bristol. Add your postcode when you book and your job goes to vetted mechanics who cover your area.",
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

const MECHANIC_FAQS: AccordionItem[] = [
  {
    question: "How do I become a Book My Tech mechanic?",
    answer:
      "Head to the For Mechanics page and start your application. It takes about 10 minutes: tell us about your business, specialisms and area, upload your documents, and we'll review your application within a few days.",
  },
  {
    question: "How and when do mechanics get paid?",
    answer:
      "The customer's payment is pre-authorised before the job and paid out to your connected account when you mark the work complete, with no invoicing or chasing.",
  },
  {
    question: "Do mechanics have to work set hours?",
    answer:
      "No. You set your own availability, service radius and specialisms, and go online whenever you like. You only ever accept the jobs that suit you.",
  },
];

const TOPICS: { icon: LucideIcon; title: string; body: string; href: string; cta: string }[] = [
  {
    icon: CalendarDays,
    title: "Book a repair or service",
    body: "Get a price for your exact car and pick a time that suits you.",
    href: "/book",
    cta: "Start a booking",
  },
  {
    icon: LayoutDashboard,
    title: "Manage your booking",
    body: "Sign in to follow your job, message your mechanic, and reschedule or cancel.",
    href: "/dashboard",
    cta: "Go to your dashboard",
  },
  {
    icon: Wrench,
    title: "Work with us",
    body: "Become a vetted mobile mechanic and get sent jobs near you.",
    href: "/mechanics",
    cta: "For mechanics",
  },
];

const JUMP_LINKS = [
  ...FAQ_GROUPS.map((g) => ({ href: `#${g.id}`, label: g.heading })),
  { href: "#mechanics", label: "For mechanics" },
  { href: "#contact", label: "Contact us" },
];

// Task 46: the marketing page pattern (docs/03-design-system.md). Gradient hero
// with jump links, topic cards overlapping it, the FAQ groups with a sticky
// "On this page" list (light), the mechanic questions in a dark panel, and
// contact on pale blue.
export default function HelpPage() {
  return (
    <>
      <CustomerNav active="Help" />
      <main>
        <section className="relative overflow-hidden bg-brand-gradient-deep text-white">
          <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-content px-4 pb-32 pt-14 text-center sm:px-6 sm:pb-36 sm:pt-[88px]">
            <Reveal stagger trigger="mount" y={18}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
                Help centre
              </p>
              <h1 className="mx-auto mb-5 mt-3 font-display text-[clamp(38px,6vw,64px)] font-extrabold leading-[1.02] tracking-[-0.028em]">
                How can we help?
              </h1>
              <p className="mx-auto max-w-2xl text-[17px] leading-[1.55] text-white/80">
                Answers to the questions we hear most about booking, pricing, payments, the
                warranty and working with Book My Tech. Still stuck? We&apos;re a message away.
              </p>
              <nav aria-label="Help topics" className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
                {JUMP_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </Reveal>
          </div>
        </section>

        {/* Topic cards pulled up over the hero's lower edge. */}
        <section className="relative z-10 -mt-20">
          <div className="mx-auto max-w-content px-4 sm:px-6">
            <Reveal as="ul" stagger className="grid gap-4 min-[861px]:grid-cols-3">
              {TOPICS.map((t) => (
                <li key={t.title}>
                  <Link
                    href={t.href}
                    className="group flex h-full flex-col rounded-[20px] border border-border bg-white p-6 shadow-float transition-[translate,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-blue/35"
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-gradient-deep text-white">
                      <Icon icon={t.icon} size={22} strokeWidth={2} />
                    </span>
                    <h2 className="mt-4 font-display text-xl font-extrabold tracking-[-0.015em] text-text-primary">
                      {t.title}
                    </h2>
                    <p className="mt-1.5 flex-1 text-[15px] leading-[1.55] text-text-secondary">{t.body}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue group-hover:text-brand-blue-dark">
                      {t.cta}
                      <Icon icon={ArrowRight} size={15} strokeWidth={2.5} />
                    </span>
                  </Link>
                </li>
              ))}
            </Reveal>
          </div>
        </section>

        {/* overflow-clip, not hidden: hidden would stop the sidebar sticking. */}
        <section className="relative overflow-clip bg-surface">
          <SectionWatermark />
          <div className="relative mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 sm:py-[88px] min-[1000px]:grid-cols-[220px_minmax(0,1fr)] min-[1000px]:gap-14">
            <aside className="hidden min-[1000px]:block">
              <nav aria-label="Questions on this page" className="sticky top-[92px] flex flex-col gap-1">
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  On this page
                </p>
                {FAQ_GROUPS.map((g) => (
                  <a
                    key={g.id}
                    href={`#${g.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
                  >
                    <Icon icon={g.icon} size={16} strokeWidth={2} className="text-brand-blue" />
                    {g.heading}
                  </a>
                ))}
              </nav>
            </aside>

            <div className="flex max-w-[820px] flex-col gap-14">
              {FAQ_GROUPS.map((group) => (
                <section key={group.id} id={group.id} className="scroll-mt-[92px]">
                  <Reveal className="mb-6 flex items-center gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-brand-blue">
                      <Icon icon={group.icon} size={22} strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-blue">
                        {group.eyebrow}
                      </p>
                      <h2 className="mt-1 font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-text-primary">
                        {group.heading}
                      </h2>
                    </div>
                  </Reveal>
                  <Accordion items={group.items} defaultOpen={null} idPrefix={`help-${group.id}`} />
                </section>
              ))}
            </div>
          </div>
        </section>

        <section id="mechanics" className="scroll-mt-[68px] bg-white">
          <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
            <div className="relative overflow-hidden rounded-[32px] bg-surface-dark px-6 py-12 text-white sm:px-12 sm:py-14">
              <SectionWatermark tone="dark" />
              <div className="relative grid items-start gap-10 min-[901px]:grid-cols-[1fr_1.3fr] min-[901px]:gap-14">
                <div>
                  <SectionHeading
                    tone="dark"
                    align="left"
                    eyebrow="For mechanics"
                    title="Joining and getting paid."
                    lead="Thinking of working with us? The short answers are here, and the For Mechanics page has the rest."
                  />
                  <div className="flex flex-wrap gap-3">
                    <Link href="/mechanics/apply/step-1">
                      <Button
                        variant="secondary"
                        iconRight={ArrowRight}
                        className="border-transparent bg-white font-bold text-brand-blue-dark hover:bg-surface"
                      >
                        Apply now
                      </Button>
                    </Link>
                    <Link href="/mechanics">
                      <Button
                        variant="ghost"
                        className="border-white/30 font-bold text-white hover:border-white hover:bg-white/10"
                      >
                        More about working with us
                      </Button>
                    </Link>
                  </div>
                </div>
                <Accordion items={MECHANIC_FAQS} defaultOpen={null} idPrefix="help-mechanic" />
              </div>
            </div>
          </div>
        </section>

        <section
          id="contact"
          className="relative scroll-mt-[68px] overflow-hidden border-t border-blue-100 bg-[linear-gradient(180deg,#eff6ff_0%,#e0ebff_100%)]"
        >
          <SectionWatermark />
          <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
            <SectionHeading
              eyebrow="Contact"
              title="Still need a hand?"
              lead="Our support team helps with bookings, payments and anything else."
            />
            <Reveal stagger className="mx-auto grid max-w-[820px] gap-4 min-[641px]:grid-cols-2">
              <a
                href="mailto:support@bookmytech.co.uk"
                className="group flex flex-col rounded-[20px] border border-border bg-white p-6 shadow-card transition-[translate,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-blue/35"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-blue text-white">
                  <Icon icon={Mail} size={22} strokeWidth={2} />
                </span>
                <h3 className="mt-4 font-display text-xl font-extrabold tracking-[-0.015em] text-text-primary">
                  Email support
                </h3>
                <p className="mt-1.5 text-[15px] text-text-secondary">support@bookmytech.co.uk</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue">
                  Send an email
                  <Icon icon={ArrowRight} size={15} strokeWidth={2.5} />
                </span>
              </a>
              <Link
                href="/dashboard"
                className="group flex flex-col rounded-[20px] border border-border bg-white p-6 shadow-card transition-[translate,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-blue/35"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-gradient-deep text-white">
                  <Icon icon={MessageCircle} size={22} strokeWidth={2} />
                </span>
                <h3 className="mt-4 font-display text-xl font-extrabold tracking-[-0.015em] text-text-primary">
                  Message in-app
                </h3>
                <p className="mt-1.5 text-[15px] text-text-secondary">
                  Sign in to message your mechanic or raise an issue with a booking.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue">
                  Go to your dashboard
                  <Icon icon={ArrowRight} size={15} strokeWidth={2.5} />
                </span>
              </Link>
            </Reveal>
            <p className="mt-8 text-center text-[13px] text-text-muted">
              Read our{" "}
              <Link href="/terms" className="font-semibold text-brand-blue hover:underline">
                Terms &amp; Conditions
              </Link>
              ,{" "}
              <Link href="/privacy" className="font-semibold text-brand-blue hover:underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/cookies" className="font-semibold text-brand-blue hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
