import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Button } from "@/components/ui/button";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import type { BrandIconProps } from "@/components/ui/brand-icons";
import {
  PoundCoinIcon,
  CalendarBoltIcon,
  MapPinIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  BanknoteIcon,
  ClipboardCheckIcon,
  RocketIcon,
} from "@/components/ui/brand-icons";
import { Footer } from "../(customer)/_components/footer";

export const metadata: Metadata = {
  title: "Become a Book My Tech mechanic — work on your terms",
  description:
    "Join Book My Tech as a vetted mobile mechanic. Set your own hours and area, get matched to jobs near you, and get paid fast. Apply in about 10 minutes.",
};

const APPLY_HREF = "/mechanics/apply/step-1";

type Benefit = { Icon: (p: BrandIconProps) => React.ReactElement; title: string; body: string };

const BENEFITS: Benefit[] = [
  {
    Icon: PoundCoinIcon,
    title: "Keep more of every job",
    body: "Transparent fixed pricing and fast payouts straight to your account. No chasing invoices, no cash handling.",
  },
  {
    Icon: CalendarBoltIcon,
    title: "Work on your terms",
    body: "Set your own hours, radius and specialisms. Go online when you want and accept only the jobs that suit you.",
  },
  {
    Icon: MapPinIcon,
    title: "Jobs come to you",
    body: "We match you to bookings near you and bring the customers — no marketing, no quoting, no time-wasters.",
  },
  {
    Icon: SmartphoneIcon,
    title: "Everything in one app",
    body: "Job details, customer messaging, photos, parts and payment all handled in the mechanic app on your phone.",
  },
  {
    Icon: BanknoteIcon,
    title: "Fast, reliable payouts",
    body: "Payment is pre-authorised before you arrive and released as soon as the job's marked complete and approved.",
  },
  {
    Icon: ShieldCheckIcon,
    title: "Backed and protected",
    body: "Every job is covered by our workmanship guarantee and dispute support, so you're never on your own.",
  },
];

type Step = { number: string; Icon: (p: BrandIconProps) => React.ReactElement; title: string; body: string };

const STEPS: Step[] = [
  {
    number: "01",
    Icon: ClipboardCheckIcon,
    title: "Apply online",
    body: "Tell us about yourself, your business, your specialisms and your area. Takes about 10 minutes.",
  },
  {
    number: "02",
    Icon: ShieldCheckIcon,
    title: "Get verified",
    body: "We check your ID, insurance and qualifications directly with the issuing bodies — usually within a few days.",
  },
  {
    number: "03",
    Icon: RocketIcon,
    title: "Go live & earn",
    body: "Download the mechanic app, set your availability and start getting matched to jobs near you.",
  },
];

const REQUIREMENTS = [
  "Photo ID (passport or driving licence)",
  "Public liability + trade insurance",
  "A recognised trade qualification (e.g. NVQ Level 2/3, City & Guilds)",
  "Your own tools and a reliable vehicle",
  "Two references",
  "A smartphone to run the mechanic app",
];

const STATS: { value: string; label: string }[] = [
  { value: "Set your own", label: "hours & area" },
  { value: "Fast", label: "payouts per job" },
  { value: "Zero", label: "lead or quoting fees" },
  { value: "Days", label: "to get verified" },
];

const FAQS: AccordionItem[] = [
  {
    question: "How much does it cost to join?",
    answer:
      "Applying is free. There are no monthly fees and no charges for leads — we take a transparent service fee per completed job, so you only ever pay when you earn.",
  },
  {
    question: "How and when do I get paid?",
    answer:
      "The customer's payment is pre-authorised before the job. Once you mark the work complete and it's approved, the payout is released to your connected account — no invoicing or chasing.",
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
      "Photo ID, valid public liability and trade insurance, a recognised trade qualification and two references. We verify these directly with the issuing bodies before your first job.",
  },
  {
    question: "How long does approval take?",
    answer:
      "Most applications are reviewed within a few working days once we have all your documents. We'll keep you updated by email at every step.",
  },
];

export default function MechanicsLandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-brand-gradient text-white">
        <CustomerNav active="For mechanics" dark />
        <div className="mx-auto grid max-w-content gap-10 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-14">
          <div>
            <Overline className="mb-3 text-white/70">For mechanics</Overline>
            <h1 className="mb-4 text-[34px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[44px] lg:text-[54px]">
              Be your own boss. We&apos;ll bring the work.
            </h1>
            <p className="mb-7 max-w-[560px] text-base leading-[1.55] text-white/85 sm:text-lg">
              Join Book My Tech&apos;s network of vetted mobile mechanics. Set your own
              hours and area, get matched to paying jobs near you, and get paid fast —
              no marketing, no quoting, no chasing invoices.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={APPLY_HREF}>
                <Button
                  variant="secondary"
                  size="lg"
                  iconRight={ArrowRight}
                  className="border-transparent bg-white text-brand-blue hover:bg-white/90"
                >
                  Start your application
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button
                  variant="ghost"
                  size="lg"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  See how it works
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/70">
              Takes about 10 minutes · free to apply · vetted in days
            </p>
          </div>

          <Card className="bg-white/10 backdrop-blur lg:ml-auto" padded>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-7">
              {STATS.map((s) => (
                <li key={s.label}>
                  <p className="text-3xl font-extrabold tracking-tight text-white">
                    {s.value}
                  </p>
                  <p className="mt-1 text-sm text-white/75">{s.label}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-surface">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[64px]">
          <div className="mx-auto mb-10 max-w-[640px] text-center">
            <Overline className="mb-2 text-brand-blue">Why join</Overline>
            <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
              Built around mechanics, not middlemen.
            </h2>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <li key={b.title}>
                <Card className="h-full">
                  <div className="mb-3.5 flex size-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                    <b.Icon size={24} className="text-text-primary" />
                  </div>
                  <h3 className="mb-1.5 text-lg font-bold tracking-[-0.01em] text-text-primary">
                    {b.title}
                  </h3>
                  <p className="text-sm leading-[1.55] text-text-secondary">{b.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-border bg-surface-card">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[64px]">
          <div className="mx-auto mb-10 max-w-[640px] text-center">
            <Overline className="mb-2 text-brand-blue">How it works</Overline>
            <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
              From application to earning in three steps.
            </h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.number}>
                <Card className="h-full">
                  <div className="mb-3.5 flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                      <s.Icon size={24} className="text-text-primary" />
                    </div>
                    <span className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-xs font-extrabold text-brand-blue">
                      {s.number}
                    </span>
                  </div>
                  <h3 className="mb-1.5 text-lg font-bold tracking-[-0.01em] text-text-primary">
                    {s.title}
                  </h3>
                  <p className="text-sm leading-[1.55] text-text-secondary">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What you'll need */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-[64px]">
          <div>
            <Overline className="mb-2 text-brand-blue">What you&apos;ll need</Overline>
            <h2 className="mb-3 text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
              Qualified, insured, ready to go.
            </h2>
            <p className="mb-6 max-w-md text-base text-text-secondary">
              We keep standards high so customers trust every mechanic on the platform.
              Have these ready and your application will fly through.
            </p>
            <Link href={APPLY_HREF}>
              <Button variant="primary" size="lg" iconRight={ArrowRight}>
                Apply now
              </Button>
            </Link>
          </div>
          <Card className="h-full">
            <ul className="flex flex-col gap-3.5">
              {REQUIREMENTS.map((r) => (
                <li key={r} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15">
                    <Icon icon={Check} size={13} className="text-success" />
                  </span>
                  <span className="text-[15px] leading-[1.5] text-text-secondary">{r}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-surface-card">
        <div className="mx-auto max-w-[820px] px-4 py-14 sm:px-8 lg:py-[64px]">
          <div className="mb-9 text-center">
            <Overline className="mb-2 text-brand-blue">Mechanic FAQ</Overline>
            <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
              Everything you need to know.
            </h2>
          </div>
          <Accordion items={FAQS} idPrefix="mech-faq" />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-brand-gradient text-white">
        <div className="mx-auto max-w-content px-4 py-14 text-center sm:px-8 lg:py-[72px]">
          <h2 className="mx-auto mb-3 max-w-2xl text-[32px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[40px]">
            Ready to put your skills to work?
          </h2>
          <p className="mx-auto mb-7 max-w-xl text-base text-white/85 sm:text-lg">
            Join the mechanics already growing their business with Book My Tech. Free to
            apply — you could be taking jobs within days.
          </p>
          <div className="flex justify-center">
            <Link href={APPLY_HREF}>
              <Button
                variant="secondary"
                size="lg"
                iconRight={ArrowRight}
                className="border-transparent bg-white text-brand-blue hover:bg-white/90"
              >
                Start your application
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
