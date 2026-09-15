import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";

export interface TickerFact {
  icon: LucideIcon;
  /** Bold part, e.g. "Free to apply". */
  value: string;
  /** Muted part after it, e.g. "no monthly fees". */
  label: string;
}

export interface FactTickerProps {
  facts: readonly TickerFact[];
  /** Accessible name for the strip. */
  label: string;
}

// Full-bleed marquee of short facts under a marketing hero (Task 46). Only
// claims the product or the terms back up; never invented figures.
//
// The facts are rendered twice and the row slides by -50%, so each item carries
// its own trailing space (padding, not flex gap) to keep the two halves exactly
// equal and the loop seamless. Reduced motion stops it.
export function FactTicker({ facts, label }: FactTickerProps) {
  return (
    <section aria-label={label} className="overflow-hidden border-b border-border bg-white py-[18px]">
      <ul className="flex w-max animate-ticker items-center whitespace-nowrap motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <Fragment key={copy}>
            {facts.map((fact) => (
              <li
                key={`${copy}-${fact.value}`}
                aria-hidden={copy === 1 || undefined}
                className="flex items-center gap-14 pr-14"
              >
                <span className="inline-flex items-center gap-3 text-sm font-bold text-text-primary">
                  <Icon icon={fact.icon} size={18} strokeWidth={2} className="text-brand-blue" />
                  <span>{fact.value}</span>
                  <span className="font-medium text-text-muted">{fact.label}</span>
                </span>
                <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-text-disabled" />
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    </section>
  );
}
