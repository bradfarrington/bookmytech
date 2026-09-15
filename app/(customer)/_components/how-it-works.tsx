import { CalendarDays, Car, Wrench, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";

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
    title: "Reg in.",
    description:
      "We look up your make, model and engine from the DVLA in seconds. No forms.",
  },
  {
    number: "02",
    icon: Wrench,
    title: "Pick what's wrong.",
    description:
      "A repair, a diagnostic, a service or an inspection — each priced for your exact car before you book.",
  },
  {
    number: "03",
    icon: CalendarDays,
    title: "Pick a time.",
    description:
      "Your card is pre-authorised, never charged up front. A vetted mechanic accepts and comes to your home, work or roadside.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-[68px]">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps from broken to booked."
          lead="No phone calls. No quotes to chase. No half-day at the dealership."
        />

        <Reveal as="ol" stagger className="grid gap-3 min-[900px]:grid-cols-3 min-[900px]:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.number}>
              <div className="relative h-full rounded-[20px] border border-border bg-white px-[26px] py-8 transition-[translate,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-blue/25 hover:shadow-card">
                <span
                  aria-hidden
                  className="block bg-[linear-gradient(180deg,#dbeafe_0%,#eef2ff_100%)] bg-clip-text font-display text-[84px] font-black leading-none tracking-[-0.05em] text-transparent"
                >
                  {s.number}
                </span>
                <span className="absolute right-6 top-6 flex size-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#eef2ff,#dbeafe)] text-brand-blue">
                  <Icon icon={s.icon} size={20} strokeWidth={2} />
                </span>
                <h3 className="mb-2 mt-1 font-display text-[22px] font-extrabold tracking-[-0.015em] text-text-primary">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="text-sm leading-[1.55] text-text-secondary">{s.description}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
