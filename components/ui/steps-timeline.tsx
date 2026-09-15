import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

export interface TimelineStep {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface StepsTimelineProps {
  steps: readonly TimelineStep[];
  className?: string;
}

// Numbered, connected steps for marketing pages (Task 46): gradient number
// discs joined by a dashed connector. Steps stack with a vertical connector on
// phones and sit in a row with a horizontal one from 900px. Reads differently
// from a card grid, which is why the homepage and /mechanics use it for "how it
// works". Three or four steps.
export function StepsTimeline({ steps, className }: StepsTimelineProps) {
  return (
    <Reveal
      as="ol"
      stagger
      className={cn(
        "grid gap-10 min-[900px]:gap-8",
        steps.length === 4 ? "min-[900px]:grid-cols-4" : "min-[900px]:grid-cols-3",
        className,
      )}
    >
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
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
  );
}
