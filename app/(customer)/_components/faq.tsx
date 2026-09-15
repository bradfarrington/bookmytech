import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";

type FaqItem = { question: string; answer: string };

// Every answer must match the customer terms (app/(customer)/terms/content.ts).
// DBS checks were removed from the platform: never claim them.
const FAQS: FaqItem[] = [
  {
    question: "How are mechanics vetted?",
    answer:
      "Every mechanic is vetted before they join Book My Tech. We check their ID, insurance and trade qualifications, and a mechanic whose insurance lapses is taken offline until it's renewed.",
  },
  {
    question: "What if I'm not happy with the work?",
    answer:
      "Eligible repairs are covered by our warranty on parts and labour for 12 months or 12,000 miles, whichever comes first. If something isn't right, contact us and we'll look into it under the warranty.",
  },
  {
    question: "Do I pay upfront?",
    answer:
      "No. Your card is pre-authorised when you book, and you're only charged when your mechanic completes the job. If they find extra work, nothing more is done or charged unless you approve it.",
  },
  {
    question: "What areas do you cover?",
    answer:
      "We're live across London, the Midlands, the North West and the South West. Enter your reg and postcode at the top of the page to get started.",
  },
  {
    question: "What if the mechanic can't fix the problem?",
    answer:
      "A diagnostic inspection is a set price (from £59.99). Your mechanic finds the fault, tells you what it needs and quotes for the repair, and you decide whether to go ahead.",
  },
  {
    question: "Is the price I see the price I pay?",
    answer:
      "Yes, for the job you booked: parts, labour and call-out, with no hidden fees. If your mechanic finds the car needs something different, they'll send you the new price to approve before any extra work is done.",
  },
];

// Native <details>, so no client JS; the first question starts open.
export function Faq() {
  return (
    <section id="faq" className="relative scroll-mt-[68px] overflow-hidden border-t border-border bg-white">
      <SectionWatermark />
      <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />

        <Reveal stagger className="mx-auto flex max-w-[820px] flex-col gap-2.5">
          {FAQS.map((item, i) => (
            <details
              key={item.question}
              open={i === 0}
              className="group overflow-hidden rounded-2xl border border-border bg-white transition-colors open:border-brand-blue/35"
            >
              <summary className="flex list-none items-center justify-between gap-5 px-[22px] py-5 text-base font-bold tracking-[-0.01em] text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden
                  className="font-display text-2xl font-normal leading-none text-text-muted group-open:text-brand-blue"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <div className="px-[22px] pb-[22px] text-[15px] leading-[1.6] text-text-secondary">
                {item.answer}
              </div>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
