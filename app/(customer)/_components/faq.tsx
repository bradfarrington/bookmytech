"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { cn } from "@/lib/utils";

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
      "We're live across Greater London with mechanics expanding through Manchester, Bristol and Birmingham. Drop your postcode into the hero above to see who's covering your area.",
  },
  {
    question: "What if the mechanic can't fix the problem?",
    answer:
      "If a diagnostic visit doesn't lead to a repair, you only pay the diagnostic fee (£45). If it does, that fee is refunded against the cost of the work.",
  },
  {
    question: "Is the price I see the price I pay?",
    answer:
      "Yes. Our quotes include parts, labour and call-out — no hidden fees. If the job turns out to be different from what we quoted, we'll talk you through it before any work begins.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[820px] px-4 py-14 sm:px-8 lg:py-[56px]">
        <div className="mb-9 text-center">
          <Overline className="mb-2 text-brand-blue">FAQ</Overline>
          <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
            Questions, answered.
          </h2>
        </div>

        <ul className="flex flex-col gap-2">
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <li key={item.question}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-surface-card px-5 py-4 text-left",
                    "transition-colors hover:border-brand-blue/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                    isOpen && "border-brand-blue/60",
                  )}
                >
                  <span className="text-base font-bold tracking-[-0.01em] text-text-primary">
                    {item.question}
                  </span>
                  <Icon
                    icon={ChevronDown}
                    size={20}
                    className={cn(
                      "shrink-0 text-text-muted transition-transform duration-200",
                      isOpen && "rotate-180 text-brand-blue",
                    )}
                  />
                </button>
                {isOpen && (
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    className="px-5 pb-5 pt-3 text-[15px] leading-[1.6] text-text-secondary"
                  >
                    {item.answer}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
