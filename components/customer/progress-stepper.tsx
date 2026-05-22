import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Your vehicle" },
  { label: "Service" },
  { label: "Price" },
  { label: "Date & time" },
];

interface ProgressStepperProps {
  currentStep: 1 | 2 | 3 | 4;
}

export function ProgressStepper({ currentStep }: ProgressStepperProps) {
  return (
    <nav aria-label="Booking progress" className="w-full">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
          const done = stepNum < currentStep;
          const active = stepNum === currentStep;

          return (
            <li key={step.label} className="flex flex-1 items-center">
              {/* Step bubble */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    done && "border-brand-blue bg-brand-blue text-white",
                    active && "border-brand-blue bg-white text-brand-blue",
                    !done && !active && "border-border bg-white text-text-muted",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? <Check size={14} strokeWidth={3} /> : stepNum}
                </div>
                <span
                  className={cn(
                    "hidden text-[11px] font-semibold tracking-wide sm:block",
                    active && "text-brand-blue",
                    done && "text-text-secondary",
                    !done && !active && "text-text-muted",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line — don't render after last step */}
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1 transition-colors",
                    done ? "bg-brand-blue" : "bg-border",
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
