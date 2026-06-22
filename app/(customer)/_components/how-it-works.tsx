import type { BrandIconProps } from "@/components/ui/brand-icons";
import {
  CarIcon,
  WrenchIcon,
  PoundCoinIcon,
  CalendarBoltIcon,
} from "@/components/ui/brand-icons";
import { Card } from "@/components/ui/card";
import { Overline } from "@/components/ui/overline";
import { Reveal } from "@/components/ui/reveal";

type Step = {
  number: string;
  Icon: (p: BrandIconProps) => React.ReactElement;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    number: "01",
    Icon: CarIcon,
    title: "Tell us your car",
    description:
      "Drop in your reg — we'll pull the make, model and engine automatically.",
  },
  {
    number: "02",
    Icon: WrenchIcon,
    title: "Pick what's wrong",
    description:
      "Choose from a service or describe a fault. We'll match the right specialist for the job.",
  },
  {
    number: "03",
    Icon: PoundCoinIcon,
    title: "See your fixed price",
    description:
      "Transparent pricing for your area. No hidden fees. Pay only when the job is done.",
  },
  {
    number: "04",
    Icon: CalendarBoltIcon,
    title: "Pick a slot, we come to you",
    description:
      "Same-day or scheduled. We'll send a vetted mechanic to your home, work, or roadside.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[56px]">
      <Reveal className="mx-auto mb-9 max-w-[600px] text-center">
        <Overline className="mb-2 text-brand-blue">How it works</Overline>
        <h2 className="mb-2 text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
          From breakdown to fixed in four taps.
        </h2>
        <p className="text-base text-text-secondary">
          No phone calls. No quotes. No waiting around for the AA. Just a fast,
          transparent booking.
        </p>
      </Reveal>

      <Reveal as="ol" stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.number}>
            <Card className="h-full p-[22px]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                  <s.Icon size={26} className="text-text-primary" />
                </div>
                <span className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-xs font-extrabold text-brand-blue">
                  {s.number}
                </span>
              </div>
              <h3 className="mb-1.5 text-lg font-bold tracking-[-0.01em] text-text-primary">
                {s.title}
              </h3>
              <p className="text-[13px] leading-[1.5] text-text-muted">
                {s.description}
              </p>
            </Card>
          </li>
        ))}
      </Reveal>
    </section>
  );
}
