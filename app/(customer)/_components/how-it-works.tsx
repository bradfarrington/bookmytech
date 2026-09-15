import { CalendarDays, Car, Wrench } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { StepsTimeline, type TimelineStep } from "@/components/ui/steps-timeline";

const STEPS: TimelineStep[] = [
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
// from the quote card above and the services grid below.
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-[68px] bg-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps from broken to booked."
          lead="No phone calls. No quotes to chase. No half-day at the dealership."
        />
        <StepsTimeline steps={STEPS} />
      </div>
    </section>
  );
}
