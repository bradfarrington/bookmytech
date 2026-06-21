import type { Metadata } from "next";
import Link from "next/link";
import {
  Mail,
  MessageCircle,
  CalendarCheck,
  MapPinned,
  Wrench,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Button } from "@/components/ui/button";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import { Footer } from "../_components/footer";

export const metadata: Metadata = {
  title: "Help & FAQ — Book My Tech",
  description:
    "Answers to common questions about booking a mobile mechanic, pricing, guarantees and working with Book My Tech. Get in touch if you need a hand.",
};

const CUSTOMER_FAQS: AccordionItem[] = [
  {
    question: "How do I book a mechanic?",
    answer:
      "Enter your registration on the homepage, pick the service you need or describe the fault, choose a time slot, and confirm. We'll match you to a vetted mechanic and they'll come to you — at home, work or the roadside.",
  },
  {
    question: "How are mechanics vetted?",
    answer:
      "Every mechanic on Book My Tech is DBS-checked, fully insured, and holds a recognised trade qualification. We verify documents directly with the issuing bodies before they take their first job.",
  },
  {
    question: "Do I pay upfront?",
    answer:
      "No. We pre-authorise the payment when you book, but we only charge you when the job is finished and you've confirmed it's been done properly.",
  },
  {
    question: "Is the price I see the price I pay?",
    answer:
      "Yes. Our quotes include parts, labour and call-out — no hidden fees. If the job turns out to be different from what we quoted, we'll talk you through it before any work begins.",
  },
  {
    question: "What if I'm not happy with the work?",
    answer:
      "Every job is backed by a 12-month parts and labour guarantee. If something isn't right, message us in-app and we'll send a mechanic back at no extra charge.",
  },
  {
    question: "What if the mechanic can't fix the problem?",
    answer:
      "If a diagnostic visit doesn't lead to a repair, you only pay the diagnostic fee (£45). If it does, that fee is refunded against the cost of the work.",
  },
  {
    question: "What areas do you cover?",
    answer:
      "We're live across Greater London with mechanics expanding through Manchester, Bristol and Birmingham. Drop your postcode into the booking form to see who's covering your area.",
  },
  {
    question: "Can I reschedule or cancel a booking?",
    answer:
      "Yes — manage your bookings from your dashboard. You can reschedule or cancel free of charge up to the start of your slot. Since nothing is charged until the job's complete, cancelling costs you nothing.",
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

type Topic = { icon: LucideIcon; title: string; body: string; href: string; cta: string };

const TOPICS: Topic[] = [
  {
    icon: CalendarCheck,
    title: "Book a service",
    body: "Get a fixed price for your car and pick a slot in about 60 seconds.",
    href: "/book",
    cta: "Start a booking",
  },
  {
    icon: MapPinned,
    title: "Track your booking",
    body: "Sign in to see your mechanic's status, message them and manage your jobs.",
    href: "/dashboard",
    cta: "Go to dashboard",
  },
  {
    icon: Wrench,
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
            Answers to the questions we hear most — about booking, pricing, guarantees
            and working with Book My Tech. Still stuck? We&apos;re a message away.
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
                  <div className="mb-3.5 flex size-11 items-center justify-center rounded-xl bg-blue-50">
                    <Icon icon={t.icon} size={20} className="text-brand-blue" />
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

          {/* Customer FAQ */}
          <div className="mx-auto mt-16 max-w-[820px]">
            <div className="mb-7">
              <Overline className="mb-2 text-brand-blue">For customers</Overline>
              <h2 className="text-[28px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[34px]">
                Booking, pricing &amp; guarantees
              </h2>
            </div>
            <Accordion items={CUSTOMER_FAQS} idPrefix="help-customer" />
          </div>

          {/* Mechanic FAQ */}
          <div className="mx-auto mt-14 max-w-[820px]">
            <div className="mb-7">
              <Overline className="mb-2 text-brand-blue">For mechanics</Overline>
              <h2 className="text-[28px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[34px]">
                Joining &amp; getting paid
              </h2>
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
              <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-extrabold tracking-[-0.02em] text-text-primary">
                    Still need a hand?
                  </h2>
                  <p className="mt-1.5 max-w-md text-sm text-text-secondary">
                    Our support team is here to help with bookings, payments and anything
                    else. Drop us a message and we&apos;ll get back to you fast.
                  </p>
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
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
