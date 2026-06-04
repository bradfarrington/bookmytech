"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPLY_STEPS, stepIndex } from "./steps";

// Compact numbered progress header for the application wizard. Shows where the
// applicant is across the five steps; the success page sits outside the steps
// so this hides there.
export function ApplyProgress() {
  const pathname = usePathname();
  if (pathname.endsWith("/submitted")) return null;
  const current = stepIndex(pathname);

  return (
    <nav aria-label="Application progress" className="mb-8">
      <ol className="flex items-center gap-2">
        {APPLY_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.path} className="flex flex-1 items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    done && "bg-brand-blue text-white",
                    active && "bg-brand-blue text-white ring-4 ring-brand-blue/15",
                    !done && !active && "bg-border-subtle text-text-muted",
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-semibold sm:inline",
                    active ? "text-text-primary" : "text-text-muted",
                  )}
                >
                  {step.shortLabel}
                </span>
              </div>
              {i < APPLY_STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1",
                    i < current ? "bg-brand-blue" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
