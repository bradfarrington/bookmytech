import { Check, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";

// Replaces the "Why Book My Tech" pillars (Task 46). Every "Book My Tech" line
// must stay true of the product: broadcast dispatch (first to accept), a
// pre-authorised hold charged on completion, and extra work only with the
// customer's approval (Tasks 33 and 37).
const OLD_WAY = [
  "Ring round garages and wait for someone to call you back.",
  "Take time off work to drop the car in.",
  "Only find out the price once it's on the ramp.",
  "Watch the bill grow between the quote and the invoice.",
  "No idea who actually worked on your car.",
];

const OUR_WAY = [
  "One reg, and prices for your exact car.",
  "Home, work or roadside — pick a time that suits you.",
  "Sent to vetted mechanics nearby; the first to accept takes the job.",
  "Price shown before you book. Extra work only with your approval.",
  "Card pre-authorised, charged only when the job's done.",
  "DBS-checked, insured, and guaranteed for 12 months.",
];

export function Compare() {
  return (
    <section className="bg-surface-dark text-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          tone="dark"
          align="left"
          eyebrow="Why Book My Tech"
          title="You've done the garage thing. It doesn't have to be like that."
          lead="Every driver has a garage story. Here's what we do differently."
        />

        <Reveal stagger className="grid gap-5 min-[801px]:grid-cols-2">
          <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-7">
            <h3 className="mb-5 flex flex-wrap items-center gap-2.5 font-display text-xl font-extrabold tracking-[-0.015em]">
              The old way
              <small className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">
                Local garage
              </small>
            </h3>
            <ul className="flex flex-col gap-3.5">
              {OLD_WAY.map((line) => (
                <li key={line} className="flex items-start gap-3 text-[15px] leading-[1.5] text-white/85">
                  <Icon icon={X} size={18} strokeWidth={2.5} className="mt-0.5 shrink-0 text-slate-400" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(160deg,#1e3a8a_0%,#2563eb_100%)] p-7 shadow-[0_20px_60px_rgba(37,99,235,0.25)]">
            <h3 className="mb-5 flex flex-wrap items-center gap-2.5 font-display text-xl font-extrabold tracking-[-0.015em]">
              Book My Tech
              <small className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-white/75">
                Booked online
              </small>
            </h3>
            <ul className="flex flex-col gap-3.5">
              {OUR_WAY.map((line) => (
                <li key={line} className="flex items-start gap-3 text-[15px] leading-[1.5] text-white/85">
                  <Icon icon={Check} size={18} strokeWidth={3} className="mt-0.5 shrink-0 text-green-300" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
