import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  CalendarClock,
  Check,
  Radio,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";

// Recruits mechanics from the homepage (replaced the placeholder reviews, Brad
// 2026-09-15). Every line matches /mechanics and the product: broadcast
// dispatch, pre-authorised payment paid out on completion, no monthly or lead
// fees. The commission rate is admin-editable, so it is never quoted here.
//
// Rendered as a contained gradient panel on a light band, so it reads as a
// different kind of section from the dark services grid above and the light
// comparison below.
const BENEFITS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CalendarClock,
    title: "Your hours, your area",
    body: "Go online when it suits you and set how far you'll travel.",
  },
  {
    icon: Radio,
    title: "Jobs sent to you",
    body: "New bookings near you go to every eligible mechanic. Accept the ones you want.",
  },
  {
    icon: Wallet,
    title: "No invoicing or chasing",
    body: "The customer's card is pre-authorised before you arrive, and you're paid out when you complete the job.",
  },
  {
    icon: BadgePercent,
    title: "No monthly fees",
    body: "Applying is free and there are no charges for leads. We take a service fee on completed jobs.",
  },
];

const REQUIREMENTS = [
  "Photo ID",
  "Public liability and trade insurance",
  "A recognised trade qualification (e.g. NVQ Level 2/3, City & Guilds)",
  "Two references",
];

export function MechanicJoin() {
  return (
    <section id="join" className="scroll-mt-[68px] bg-surface">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <div className="relative overflow-hidden rounded-[32px] bg-brand-gradient-deep px-6 py-12 text-white shadow-hero sm:px-12 sm:py-16">
          <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 opacity-60" />
          <SectionWatermark tone="dark" />

          <div className="relative grid items-start gap-10 min-[901px]:grid-cols-[1.2fr_1fr] min-[901px]:gap-14">
            <div>
              <SectionHeading
                tone="dark"
                align="left"
                eyebrow="For mechanics"
                title="Fix cars on your terms. We'll bring the work."
                lead="Join Book My Tech's network of vetted mobile mechanics in London, the Midlands, the North West and the South West."
              />

              <Reveal as="ul" stagger className="grid gap-5 min-[561px]:grid-cols-2">
                {BENEFITS.map((b) => (
                  <li key={b.title} className="flex items-start gap-3.5">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-inset ring-white/15">
                      <Icon icon={b.icon} size={20} strokeWidth={2} />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-white">{b.title}</h3>
                      <p className="mt-1 text-sm leading-[1.55] text-white/75">{b.body}</p>
                    </div>
                  </li>
                ))}
              </Reveal>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/mechanics/apply">
                  <Button
                    variant="secondary"
                    size="lg"
                    iconRight={ArrowRight}
                    className="border-transparent bg-white font-bold text-brand-blue-dark hover:bg-surface"
                  >
                    Apply now
                  </Button>
                </Link>
                <Link href="/mechanics">
                  <Button
                    variant="ghost"
                    size="lg"
                    className="border-white/30 font-bold text-white hover:border-white hover:bg-white/10"
                  >
                    How it works for mechanics
                  </Button>
                </Link>
              </div>
            </div>

            <Reveal className="rounded-[20px] bg-white p-[26px] text-text-primary shadow-float">
              <h3 className="font-display text-[22px] font-extrabold tracking-[-0.015em]">
                What you&apos;ll need
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                Applying takes about 10 minutes, and our team checks everything as part of your
                application.
              </p>
              <ul className="mt-5 flex flex-col gap-3">
                {REQUIREMENTS.map((r) => (
                  <li key={r} className="flex items-start gap-3 text-[15px] leading-[1.5]">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-green-700">
                      <Icon icon={Check} size={12} strokeWidth={3} />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
