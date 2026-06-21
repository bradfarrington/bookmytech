"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type AccordionItem = { question: string; answer: string };

export interface AccordionProps {
  items: AccordionItem[];
  /** Index open on first render; pass null for all-closed. */
  defaultOpen?: number | null;
  /** Prefix for generated panel ids so multiple accordions stay unique. */
  idPrefix?: string;
}

export function Accordion({ items, defaultOpen = 0, idPrefix = "acc" }: AccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpen);

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <li key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`${idPrefix}-panel-${i}`}
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
                id={`${idPrefix}-panel-${i}`}
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
  );
}
