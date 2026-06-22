import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, ArrowRight } from "lucide-react";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Button } from "@/components/ui/button";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import type { BrandIconProps } from "@/components/ui/brand-icons";
import {
  CalendarBoltIcon,
  MapPinIcon,
  WrenchIcon,
  PoundCoinIcon,
  RosetteIcon,
  ChatCheckIcon,
  HeadsetIcon,
} from "@/components/ui/brand-icons";
import { Footer } from "../_components/footer";

export const metadata: Metadata = {
  title: "Help & FAQ — Book My Tech",
  description:
    "Answers to common questions about booking a mobile mechanic, pricing, payments, guarantees, areas and working with Book My Tech. Get in touch if you need a hand.",
};

type FaqGroup = {
  eyebrow: string;
  heading: string;
  Icon: (p: BrandIconProps) => React.ReactElement;
  items: AccordionItem[];
};

const FAQ_GROUPS: FaqGroup[] = [
  {
    eyebrow: "Getting started",
    heading: "Booking & appointments",
    Icon: CalendarBoltIcon,
    items: [
      {
        question: "How do I book a mechanic?",
        answer:
          "Enter your registration on the homepage, pick the service you need or describe the fault, choose a time slot, and confirm. We'll match you to a vetted mechanic and they'll come to you — at home, work or the roadside.",
      },
      {
        question: "How quickly can someone come out?",
        answer:
          "Most jobs are booked within about four hours, and same-day or next-day slots are usually available. You'll see the earliest times for your area when you pick a slot.",
      },
      {
        question: "Where can the mechanic work on my car?",
        answer:
          "Anywhere it's safe and legal to — your driveway, a workplace car park, or the roadside. You choose the location when you book. Some jobs need a reasonably level, accessible spot; we'll flag it if so.",
      },
      {
        question: "Can I reschedule or cancel a booking?",
        answer:
          "Yes — manage your bookings from your dashboard. You can reschedule or cancel free of charge up to the start of your slot. Since nothing is charged until the job's complete, cancelling costs you nothing.",
      },
      {
        question: "What if I'm not at home when the mechanic arrives?",
        answer:
          "You (or someone who can authorise the work and give access to the vehicle) should be present at the start of the appointment. If your plans change, reschedule from your dashboard before the slot begins.",
      },
    ],
  },
  {
    eyebrow: "Money",
    heading: "Pricing & payments",
    Icon: PoundCoinIcon,
    items: [
      {
        question: "Is the price I see the price I pay?",
        answer:
          "Yes. Our quotes include parts, labour and call-out — no hidden fees. If the job turns out to be different from what we quoted, we'll talk you through it and agree a price before any further work begins.",
      },
      {
        question: "Do I pay upfront?",
        answer:
          "No. We pre-authorise the payment when you book — this reserves the funds but doesn't charge you. We only take payment once the job is finished and you've confirmed it's been done properly.",
      },
      {
        question: "What payment methods can I use?",
        answer:
          "We accept all major debit and credit cards. Payments are processed securely by our payment provider; we never store your full card details.",
      },
      {
        question: "What if the mechanic can't fix the problem?",
        answer:
          "If a diagnostic visit doesn't lead to a repair, you only pay the diagnostic fee (£45). If it does lead to a repair, that fee is credited against the cost of the work.",
      },
      {
        question: "How do refunds work?",
        answer:
          "If a booking is cancelled before any work is captured, the pre-authorisation is released in full. Where a refund is due after payment — for example following a dispute — it's returned to your original payment method.",
      },
    ],
  },
  {
    eyebrow: "Peace of mind",
    heading: "Guarantees, vetting & disputes",
    Icon: RosetteIcon,
    items: [
      {
        question: "How are mechanics vetted?",
        answer:
          "Every mechanic on Book My Tech is DBS-checked, fully insured, and holds a recognised trade qualification. We verify documents directly with the issuing bodies before they take their first job, and we track quality through reviews.",
      },
      {
        question: "What does the 12-month guarantee cover?",
        answer:
          "Every job is backed by a 12-month parts and labour guarantee, subject to fair wear and tear. If a fault with the original work recurs within that period, message us and we'll arrange for it to be put right at no extra charge.",
      },
      {
        question: "What if I'm not happy with the work?",
        answer:
          "Raise it from your dashboard within the confirmation window. Our support team will review the booking and can hold or reverse payment while we investigate. We aim to resolve disputes fairly and quickly.",
      },
      {
        question: "Are the parts genuine?",
        answer:
          "We fit genuine or OE-quality parts as standard, covered by the same 12-month guarantee as the labour.",
      },
    ],
  },
  {
    eyebrow: "Coverage",
    heading: "Areas & vehicles",
    Icon: MapPinIcon,
    items: [
      {
        question: "What areas do you cover?",
        answer:
          "We're live across Greater London with mechanics expanding through Manchester, Bristol and Birmingham. Drop your postcode into the booking form to see who's covering your area.",
      },
      {
        question: "What vehicles can you work on?",
        answer:
          "We cover the vast majority of cars and light vans. Enter your registration and we'll pull your make, model and engine automatically and show you the services available for it.",
      },
      {
        question: "Do you do MOTs?",
        answer:
          "We offer MOT pre-checks so you can fix any issues before the test, and we're expanding MOT booking in selected areas. Enter your reg to see what's available where you are.",
      },
    ],
  },
];

const MECHANIC_FAQS: AccordionItem[] = [
  {
    question: "How do I become a Book My Tech mechanic?",
    answer:
      "Head to the For Mechanics page and start your application. It takes about 10 minutes — tell us about your business, specialisms and area, upload your documents, and we'll verify you within a few days.",
  },
  {
    question: "How and when do mechanics get paid?",
    answer:
      "The customer's payment is pre-authorised before the job and released to your connected account as soon as the work is marked complete and approved — no invoicing or chasing.",
  },
  {
    question: "Do mechanics have to work set hours?",
    answer:
      "No. You set your own availability, service radius and specialisms, and go online whenever you like. You only ever accept the jobs that suit you.",
  },
];

type Topic = {
  Icon: (p: BrandIconProps) => React.ReactElement;
  title: string;
  body: string;
  href: string;
  cta: string;
};

const TOPICS: Topic[] = [
  {
    Icon: CalendarBoltIcon,
    title: "Book a service",
    body: "Get a fixed price for your car and pick a slot in about 60 seconds.",
    href: "/book",
    cta: "Start a booking",
  },
  {
    Icon: ChatCheckIcon,
    title: "Track your booking",
    body: "Sign in to see your mechanic's status, message them and manage your jobs.",
    href: "/dashboard",
    cta: "Go to dashboard",
  },
  {
    Icon: WrenchIcon,
    title: "Work with us",
    body: "Become a vetted mobile mechanic and get matched to jobs near you.",
    href: "/mechanics",
    cta: "For mechanics",
  },
];

export default function HelpPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-brand-gradient text-white">
        <CustomerNav active="Help" dark />
        <div className="mx-auto max-w-content px-4 pb-16 pt-10 text-center sm:px-8 lg:pb-20 lg:pt-14">
          <Overline className="mb-3 text-white/70">Help centre</Overline>
          <h1 className="mx-auto mb-4 max-w-3xl text-[34px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[44px] lg:text-[52px]">
            How can we help?
          </h1>
          <p className="mx-auto max-w-2xl text-base text-white/85 sm:text-lg">
            Answers to the questions we hear most — about booking, pricing, payments,
            guarantees and working with Book My Tech. Still stuck? We&apos;re a message away.
          </p>
        </div>
      </section>

      <main className="bg-surface">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[64px]">
          {/* Quick topics */}
          <ul className="grid gap-4 sm:grid-cols-3">
            {TOPICS.map((t) => (
              <li key={t.title}>
                <Card className="flex h-full flex-col">
                  <div className="mb-3.5 flex size-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                    <t.Icon size={24} className="text-text-primary" />
                  </div>
                  <h2 className="mb-1.5 text-lg font-bold tracking-[-0.01em] text-text-primary">
                    {t.title}
                  </h2>
                  <p className="mb-4 flex-1 text-sm leading-[1.55] text-text-secondary">
                    {t.body}
                  </p>
                  <Link
                    href={t.href}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark"
                  >
                    {t.cta}
                    <Icon icon={ArrowRight} size={15} />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>

          {/* Customer FAQ groups */}
          <div className="mx-auto mt-16 max-w-[820px] flex flex-col gap-12">
            {FAQ_GROUPS.map((group) => (
              <section key={group.heading}>
                <div className="mb-6 flex items-center gap-3.5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                    <group.Icon size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <Overline className="mb-1 text-brand-blue">{group.eyebrow}</Overline>
                    <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[28px]">
                      {group.heading}
                    </h2>
                  </div>
                </div>
                <Accordion
                  items={group.items}
                  defaultOpen={null}
                  idPrefix={`help-${group.heading.replace(/\s+/g, "-").toLowerCase()}`}
                />
              </section>
            ))}
          </div>

          {/* Mechanic FAQ */}
          <div className="mx-auto mt-14 max-w-[820px]">
            <div className="mb-6 flex items-center gap-3.5">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                <WrenchIcon size={24} className="text-text-primary" />
              </div>
              <div>
                <Overline className="mb-1 text-brand-blue">For mechanics</Overline>
                <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[28px]">
                  Joining &amp; getting paid
                </h2>
              </div>
            </div>
            <Accordion items={MECHANIC_FAQS} defaultOpen={null} idPrefix="help-mechanic" />
            <div className="mt-5">
              <Link
                href="/mechanics"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark"
              >
                More about working with us
                <Icon icon={ArrowRight} size={15} />
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div className="mx-auto mt-16 max-w-[820px]">
            <Card className="bg-surface-card">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                    <HeadsetIcon size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold tracking-[-0.02em] text-text-primary">
                      Still need a hand?
                    </h2>
                    <p className="mt-1.5 max-w-md text-sm text-text-secondary">
                      Our support team helps with bookings, payments and anything else.
                      We&apos;re here 8am–8pm, seven days a week, and reply fast.
                    </p>
                  </div>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-2.5 sm:w-auto">
                  <a href="mailto:support@bookmytech.co.uk">
                    <Button variant="primary" size="md" iconLeft={Mail} fullWidth>
                      Email support
                    </Button>
                  </a>
                  <Link href="/dashboard">
                    <Button variant="ghost" size="md" iconLeft={MessageCircle} fullWidth>
                      Message in-app
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
            <p className="mt-4 text-center text-xs text-text-muted">
              Read our{" "}
              <Link href="/terms" className="font-semibold text-brand-blue hover:underline">
                Terms
              </Link>
              ,{" "}
              <Link href="/privacy" className="font-semibold text-brand-blue hover:underline">
                Privacy Notice
              </Link>{" "}
              and{" "}
              <Link href="/cookies" className="font-semibold text-brand-blue hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
