"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type AccordionItem = { question: string; answer: string };

export interface AccordionProps {
  items: AccordionItem[];
  /** Index open on first render; pass null for all-closed. */
  defaultOpen?: number | null;
  /** Prefix for generated panel ids so multiple accordions stay unique. */
  idPrefix?: string;
}

// Question-and-answer list, one open at a time. Styled to match the homepage
// FAQ (Task 46): white bordered rows, a +/− marker, the open row outlined in
// brand blue. Works on light and dark sections alike.
export function Accordion({ items, defaultOpen = 0, idPrefix = "acc" }: AccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpen);

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <li
            key={item.question}
            className={cn(
              "overflow-hidden rounded-2xl border bg-white transition-colors",
              isOpen ? "border-brand-blue/35" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`${idPrefix}-panel-${i}`}
              className="flex w-full items-center justify-between gap-5 px-[22px] py-5 text-left text-base font-bold tracking-[-0.01em] text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
            >
              <span>{item.question}</span>
              <span
                aria-hidden
                className={cn(
                  "font-display text-2xl font-normal leading-none",
                  isOpen ? "text-brand-blue" : "text-text-muted",
                )}
              >
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && (
              <div
                id={`${idPrefix}-panel-${i}`}
                role="region"
                className="px-[22px] pb-[22px] text-[15px] leading-[1.6] text-text-secondary"
              >
                {item.answer}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
