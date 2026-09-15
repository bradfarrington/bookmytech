import { CalendarDays, Car, Wrench, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";

type Step = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    icon: Car,
    title: "Reg in.",
    description:
      "We look up your make, model and engine from the DVLA in seconds. No forms.",
  },
  {
    icon: Wrench,
    title: "Pick what's wrong.",
    description:
      "A repair, a diagnostic, a service or an inspection, each priced for your exact car before you book.",
  },
  {
    icon: CalendarDays,
    title: "Pick a time.",
    description:
      "Your card is pre-authorised, never charged up front. A vetted mechanic accepts and comes to your home, work or roadside.",
  },
];

// A connected timeline rather than a row of cards, so it reads differently
// from the quote card above and the services grid below. Steps stack with a
// vertical connector on phones and sit in a row with a horizontal one on
// desktop.
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-[68px] bg-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps from broken to booked."
          lead="No phone calls. No quotes to chase. No half-day at the dealership."
        />

        <Reveal as="ol" stagger className="grid gap-10 min-[900px]:grid-cols-3 min-[900px]:gap-8">
          {STEPS.map((s, i) => {
            const last = i === STEPS.length - 1;
            return (
              <li
                key={s.title}
                className="relative flex gap-5 min-[900px]:flex-col min-[900px]:items-center min-[900px]:text-center"
              >
                {!last && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute border-dashed border-blue-200",
                      // phone: down from this disc to the next
                      "bottom-[-40px] left-9 top-[84px] border-l-2",
                      // desktop: across from this disc to the next
                      "min-[900px]:bottom-auto min-[900px]:left-[calc(50%+52px)] min-[900px]:right-[calc(-50%+36px)] min-[900px]:top-9 min-[900px]:border-l-0 min-[900px]:border-t-2",
                    )}
                  />
                )}

                <div className="relative shrink-0">
                  <span className="flex size-[72px] items-center justify-center rounded-full bg-brand-gradient-deep font-display text-[28px] font-black text-white shadow-[0_12px_28px_rgba(37,99,235,0.3)]">
                    {i + 1}
                  </span>
                  <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-white bg-blue-50 text-brand-blue">
                    <Icon icon={s.icon} size={15} strokeWidth={2.2} />
                  </span>
                </div>

                <div className="min-[900px]:mt-5 min-[900px]:max-w-[300px]">
                  <h3 className="mb-2 font-display text-[22px] font-extrabold tracking-[-0.015em] text-text-primary">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="text-[15px] leading-[1.55] text-text-secondary">{s.description}</p>
                </div>
              </li>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
