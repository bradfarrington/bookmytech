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
  const current = STEPS[currentStep - 1];

  return (
    <nav aria-label="Booking progress" className="w-full">
      {/* Caption — makes the position in the flow unmistakable. */}
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">
          Step {currentStep} of {STEPS.length}
        </p>
        <p className="text-sm font-semibold text-text-secondary">{current.label}</p>
      </div>

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
                    "flex size-9 items-center justify-center rounded-full text-sm font-extrabold transition-all",
                    done && "bg-brand-blue text-white",
                    active &&
                      "bg-brand-gradient text-white shadow-[0_4px_12px_rgba(37,99,235,0.35)] ring-4 ring-brand-blue/15",
                    !done && !active && "border-2 border-border bg-white text-text-muted",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? <Check size={16} strokeWidth={3} /> : stepNum}
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
                <div className="mx-2 h-1 flex-1 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "h-full rounded-full bg-brand-blue transition-all duration-500",
                      done ? "w-full" : "w-0",
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
