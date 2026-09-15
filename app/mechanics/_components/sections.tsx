import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";
import { StepsTimeline } from "@/components/ui/steps-timeline";
import { MECHANIC_BENEFITS, MECHANIC_REQUIREMENTS, MECHANIC_STEPS } from "./recruitment";

// Sections shared by /mechanics and /mechanics/[area-slug] (Task 46), following
// the marketing page pattern in docs/03-design-system.md. Each has its own
// surface so neighbouring sections never blend: benefits on the default light
// background, the timeline on pale blue, requirements on dark navy.

export function MechanicBenefits() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="Why join"
          title="Built around mechanics, not middlemen."
          lead="Everything that isn't fixing the car (finding customers, quoting, chasing payment) is handled for you."
        />
        <Reveal as="ul" stagger className="grid gap-x-10 gap-y-9 min-[641px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {MECHANIC_BENEFITS.map((b) => (
            <li key={b.title} className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-deep text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)]">
                <Icon icon={b.icon} size={22} strokeWidth={2} />
              </span>
              <div>
                <h3 className="font-display text-lg font-extrabold tracking-[-0.01em] text-text-primary">
                  {b.title}
                </h3>
                <p className="mt-1.5 text-[15px] leading-[1.55] text-text-secondary">{b.body}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function MechanicHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-[68px] overflow-hidden border-y border-blue-100 bg-[linear-gradient(180deg,#eff6ff_0%,#e0ebff_100%)]"
    >
      <SectionWatermark />
      <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="How it works"
          title="From application to earning in three steps."
        />
        <StepsTimeline steps={MECHANIC_STEPS} />
      </div>
    </section>
  );
}

export interface MechanicRequirementsProps {
  applyHref: string;
  ctaLabel?: string;
}

export function MechanicRequirements({ applyHref, ctaLabel = "Apply now" }: MechanicRequirementsProps) {
  return (
    <section className="relative overflow-hidden bg-surface-dark text-white">
      <SectionWatermark tone="dark" />
      <div className="relative mx-auto grid max-w-content items-center gap-10 px-4 py-14 sm:px-6 sm:py-[88px] min-[901px]:grid-cols-2 min-[901px]:gap-14">
        <div>
          <SectionHeading
            tone="dark"
            align="left"
            eyebrow="What you'll need"
            title="Qualified, insured, ready to go."
            lead="We keep standards high so customers trust every mechanic on the platform. Have these ready and your application will fly through."
          />
          <Link href={applyHref}>
            <Button
              variant="secondary"
              size="lg"
              iconRight={ArrowRight}
              className="border-transparent bg-white font-bold text-brand-blue-dark hover:bg-surface"
            >
              {ctaLabel}
            </Button>
          </Link>
        </div>

        <Reveal className="rounded-[20px] border border-white/10 bg-white/[0.05] p-6 sm:p-7">
          <ul className="flex flex-col gap-4">
            {MECHANIC_REQUIREMENTS.map((r) => (
              <li key={r} className="flex items-start gap-3 text-[15px] leading-[1.5] text-white/90">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-green-300">
                  <Icon icon={Check} size={12} strokeWidth={3} />
                </span>
                {r}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

export interface MechanicFinalCtaProps {
  applyHref: string;
  title: string;
  body: string;
}

export function MechanicFinalCta({ applyHref, title, body }: MechanicFinalCtaProps) {
  return (
    <section className="relative overflow-hidden bg-brand-gradient-deep text-white">
      <div aria-hidden className="final-glow pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto max-w-[720px] px-4 py-[72px] text-center sm:px-6 sm:py-[100px]">
        <Reveal>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
            Ready to join?
          </p>
          <h2 className="mb-4 mt-3 font-display text-[clamp(32px,5vw,54px)] font-extrabold leading-[1.05] tracking-[-0.025em]">
            {title}
          </h2>
          <p className="mb-8 text-lg text-white/80">{body}</p>
          <Link href={applyHref}>
            <Button
              variant="secondary"
              size="lg"
              iconRight={ArrowRight}
              className="border-transparent bg-white font-bold text-brand-blue-dark hover:bg-surface"
            >
              Start your application
            </Button>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
