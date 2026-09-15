"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPLY_STEPS, stepIndex } from "./steps";

// Compact numbered progress for the application wizard, drawn on the layout's
// gradient band (Task 46). Shows where the applicant is across the five steps;
// the success page sits outside the steps so this hides there.
export function ApplyProgress() {
  const pathname = usePathname();
  if (pathname.endsWith("/submitted")) return null;
  const current = stepIndex(pathname);

  return (
    <nav aria-label="Application progress" className="mt-6">
      <ol className="flex items-center gap-2">
        {APPLY_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.path} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    done && "bg-white text-brand-blue-dark",
                    active && "bg-white text-brand-blue-dark ring-4 ring-white/25",
                    !done && !active && "bg-white/10 text-white/70 ring-1 ring-inset ring-white/20",
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-semibold sm:inline",
                    active ? "text-white" : "text-white/65",
                  )}
                >
                  {step.shortLabel}
                </span>
              </div>
              {i < APPLY_STEPS.length - 1 && (
                <span className={cn("h-px flex-1", i < current ? "bg-white" : "bg-white/20")} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
