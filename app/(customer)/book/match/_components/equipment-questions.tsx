import Link from "next/link";
import { Snowflake, Power } from "lucide-react";

import { EQUIPMENT_QUESTION, EQUIPMENT_WHY, type EquipmentAnswer } from "@/lib/bookings/car-equipment";
import type { EquipmentKey } from "@/lib/parts/repair-part-choice";
import { cn } from "@/lib/utils";

// Task 87: the price step asks about air-con and stop-start, only when a part
// the jobs need depends on it. Plain links, no client code: each answer is a
// URL, re-priced on the server like every other change on this step.

export interface EquipmentQuestion {
  key: EquipmentKey;
  /** The answer in effect: from this booking's URL, or the customer's saved car. Null: not answered. */
  answer: EquipmentAnswer | null;
  /** Where each answer goes. */
  hrefs: Record<EquipmentAnswer, string>;
}

const CHOICES: ReadonlyArray<{ value: EquipmentAnswer; label: string }> = [
  { value: "y", label: "Yes" },
  { value: "n", label: "No" },
  { value: "u", label: "Not sure" },
];

const ICON = { air_con: Snowflake, stop_start: Power } as const;

export function EquipmentQuestions({ questions }: { questions: EquipmentQuestion[] }) {
  if (questions.length === 0) return null;
  const waiting = questions.some((q) => q.answer == null);
  return (
    <section
      aria-label="About your car"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-surface-card p-5",
        waiting ? "border-brand-blue" : "border-border",
      )}
    >
      <div>
        <h2 className="text-base font-semibold text-text-primary">A quick question about your car</h2>
        <p className="mt-1 text-sm text-text-secondary">{EQUIPMENT_WHY}</p>
      </div>
      {questions.map((q) => {
        const Icon = ICON[q.key];
        return (
          <div key={q.key} className="flex flex-col gap-2.5">
            <p className="flex items-start gap-2 text-sm font-medium text-text-primary">
              <Icon size={16} className="mt-0.5 shrink-0 text-brand-blue" aria-hidden />
              {EQUIPMENT_QUESTION[q.key]}
            </p>
            <div role="radiogroup" aria-label={EQUIPMENT_QUESTION[q.key]} className="grid grid-cols-3 gap-2">
              {CHOICES.map((choice) => {
                const selected = q.answer === choice.value;
                return (
                  <Link
                    key={choice.value}
                    href={q.hrefs[choice.value]}
                    scroll={false}
                    replace
                    role="radio"
                    aria-checked={selected}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-center text-sm font-medium transition-colors",
                      selected
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-border bg-surface text-text-primary hover:border-brand-blue",
                    )}
                  >
                    {choice.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
