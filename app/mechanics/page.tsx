import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgePercent, CreditCard, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { CustomerNav } from "@/components/ui/customer-nav";
import { FactTicker } from "@/components/ui/fact-ticker";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";
import { Footer } from "../(customer)/_components/footer";
import { MECHANIC_FACTS, MECHANIC_FAQS, applyHref } from "./_components/recruitment";
import {
  MechanicBenefits,
  MechanicFinalCta,
  MechanicHowItWorks,
  MechanicRequirements,
} from "./_components/sections";

export const metadata: Metadata = {
  title: "Become a Book My Tech mechanic | Work on your terms",
  description:
    "Join Book My Tech as a vetted mobile mechanic. Set your own hours and area, get matched to jobs near you, and get paid when the job's done. Apply in about 10 minutes.",
};

const APPLY_HREF = applyHref();

// How a mechanic gets paid, in order (Task 37's payout path and the mechanic
// agreement). The service fee rate is admin-editable, so it isn't quoted.
const PAYMENT_STEPS: { icon: LucideIcon; text: string }[] = [
  { icon: CreditCard, text: "The customer's card is pre-authorised when they book." },
  { icon: Wrench, text: "You do the job and mark it complete in the app." },
  { icon: Wallet, text: "Your payout goes to your connected account." },
  { icon: BadgePercent, text: "We take a service fee on completed jobs. No monthly fees, no lead charges." },
];

// Task 46: the marketing page pattern (docs/03-design-system.md). Sections in
// order, each on its own surface: gradient hero, fact ticker, benefits (light),
// timeline (pale blue), requirements (dark), FAQ (white), gradient CTA.
export default function MechanicsLandingPage() {
  return (
    <>
      <CustomerNav active="For mechanics" />
      <main>
        <section className="relative overflow-hidden bg-brand-gradient-deep text-white">
          <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-content items-center gap-12 px-4 pb-[72px] pt-14 sm:px-6 sm:pb-24 sm:pt-[88px] min-[1000px]:grid-cols-[1.15fr_1fr] min-[1000px]:gap-[72px]">
            <Reveal stagger trigger="mount" y={18}>
              <span className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-[7px] pl-2.5 pr-3 text-xs font-semibold">
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-success shadow-[0_0_0_4px_rgba(34,197,94,0.24)]"
                />
                For mechanics across four regions of England
              </span>

              <h1 className="mb-[22px] font-display text-[clamp(38px,6vw,68px)] font-extrabold leading-[1.02] tracking-[-0.028em]">
                Be your own boss.
                <br />
                We&apos;ll bring the{" "}
                <em className="bg-[linear-gradient(90deg,#fff_0%,#fff_55%,#93c5fd_100%)] bg-clip-text not-italic text-transparent">
                  work.
                </em>
              </h1>

              <p className="mb-8 max-w-[560px] text-[17px] leading-[1.55] text-white/80">
                Join Book My Tech&apos;s network of vetted mobile mechanics. Set your own hours and
                area, get sent paying jobs near you, and get paid when the job&apos;s done: no
                marketing, no quoting, no chasing invoices.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href={APPLY_HREF}>
                  <Button
                    variant="secondary"
                    size="lg"
                    iconRight={ArrowRight}
                    className="border-transparent bg-white font-bold text-brand-blue-dark hover:bg-surface"
                  >
                    Start your application
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button
                    variant="ghost"
                    size="lg"
                    className="border-white/30 font-bold text-white hover:border-white hover:bg-white/10"
                  >
                    See how it works
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm text-white/70">
                Takes about 10 minutes · free to apply · reviewed in days
              </p>
            </Reveal>

            <Reveal
              trigger="mount"
              delay={0.2}
              className="rounded-[20px] border border-white/15 bg-white/[0.06] p-6 backdrop-blur-[8px] sm:p-7 min-[1000px]:ml-auto min-[1000px]:max-w-[460px]"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-200">
                Getting paid
              </p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.02em]">
                No invoices. No chasing.
              </h2>
              <ol className="mt-6 flex flex-col gap-4">
                {PAYMENT_STEPS.map((step, i) => (
                  <li key={step.text} className="flex items-start gap-3.5">
                    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-inset ring-white/15">
                      <Icon icon={step.icon} size={18} strokeWidth={2} />
                      <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-brand-blue-dark">
                        {i + 1}
                      </span>
                    </span>
                    <span className="pt-2 text-[15px] leading-[1.45] text-white/85">{step.text}</span>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </section>

        <FactTicker facts={MECHANIC_FACTS} label="Why mechanics join Book My Tech" />
        <MechanicBenefits />
        <MechanicHowItWorks />
        <MechanicRequirements applyHref={APPLY_HREF} />

        <section className="relative overflow-hidden bg-white">
          <SectionWatermark />
          <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
            <SectionHeading eyebrow="Mechanic FAQ" title="Everything you need to know." />
            <div className="mx-auto max-w-[820px]">
              <Accordion items={MECHANIC_FAQS} idPrefix="mech-faq" />
            </div>
          </div>
        </section>

        <MechanicFinalCta
          applyHref={APPLY_HREF}
          title="Ready to put your skills to work?"
          body="Free to apply, and you could be taking jobs within days."
        />
      </main>
      <Footer />
    </>
  );
}
