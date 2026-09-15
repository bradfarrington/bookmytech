import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";

type FaqItem = { question: string; answer: string };

const FAQS: FaqItem[] = [
  {
    question: "How are mechanics vetted?",
    answer:
      "Every mechanic on Book My Tech is DBS-checked, fully insured, and holds a recognised trade qualification. We verify documents directly with the issuing bodies before they take their first job.",
  },
  {
    question: "What if I'm not happy with the work?",
    answer:
      "Every job is backed by a 12-month parts and labour guarantee. If something isn't right, message us in-app and we'll send a mechanic back at no extra charge.",
  },
  {
    question: "Do I pay upfront?",
    answer:
      "No. We pre-authorise the payment when you book, but we only charge you when the job is finished and you've confirmed it's been done properly.",
  },
  {
    question: "What areas do you cover?",
    answer:
      "We're live across Greater London, with Manchester, Birmingham and Bristol coming soon. Enter your reg and postcode at the top of the page to get started.",
  },
  {
    question: "What if the mechanic can't fix the problem?",
    answer:
      "A diagnostic inspection is a set price (from £59.99). Your mechanic finds the fault, tells you what it needs and quotes for the repair — you decide whether to go ahead.",
  },
  {
    question: "Is the price I see the price I pay?",
    answer:
      "Yes. Our quotes include parts, labour and call-out — no hidden fees. If the job turns out to be different from what we quoted, we'll talk you through it before any work begins.",
  },
];

// Native <details>, so no client JS; the first question starts open.
export function Faq() {
  return (
    <section id="faq" className="scroll-mt-[68px] border-t border-border bg-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
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
