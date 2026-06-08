import { Car, Wrench, PoundSterling, Calendar, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";

type Step = {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    number: "01",
    icon: Car,
    title: "Tell us your car",
    description:
      "Drop in your reg — we'll pull the make, model and engine automatically.",
  },
  {
    number: "02",
    icon: Wrench,
    title: "Pick what's wrong",
    description:
      "Choose from a service or describe a fault. We'll match the right specialist for the job.",
  },
  {
    number: "03",
    icon: PoundSterling,
    title: "See your fixed price",
    description:
      "Transparent pricing for your area. No hidden fees. Pay only when the job is done.",
  },
  {
    number: "04",
    icon: Calendar,
    title: "Pick a slot, we come to you",
    description:
      "Same-day or scheduled. We'll send a vetted mechanic to your home, work, or roadside.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[56px]">
      <div className="mx-auto mb-9 max-w-[600px] text-center">
        <Overline className="mb-2 text-brand-blue">How it works</Overline>
        <h2 className="mb-2 text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
          From breakdown to fixed in four taps.
        </h2>
        <p className="text-base text-text-secondary">
          No phone calls. No quotes. No waiting around for the AA. Just a fast,
          transparent booking.
        </p>
      </div>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.number}>
            <Card className="h-full p-[22px]">
              <div className="mb-3.5 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-blue-50">
                  <Icon icon={s.icon} size={20} className="text-brand-blue" />
                </div>
                <span className="text-[11px] font-extrabold tracking-[0.1em] text-text-disabled">
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
      </ol>
    </section>
  );
}
