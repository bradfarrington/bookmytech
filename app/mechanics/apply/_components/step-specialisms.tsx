"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApplication } from "./application-provider";
import { StepShell } from "./step-shell";
import { FIELD_LABEL, FIELD_HINT } from "./field";

export interface ServiceOption {
  slug: string;
  name: string;
}

export function StepSpecialisms({ services }: { services: ServiceOption[] }) {
  const router = useRouter();
  const { data, update } = useApplication();
  const [error, setError] = useState<string | null>(null);

  const selected = new Set(data.specialisms);

  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    update({ specialisms: [...next] });
  }

  function handleNext() {
    if (selected.size === 0)
      return setError("Pick at least one thing you work on.");
    setError(null);
    router.push("/mechanics/apply/step-4");
  }

  return (
    <StepShell
      title="Specialisms & service area"
      intro="Tell us what you work on and how far you're willing to travel."
      backHref="/mechanics/apply/step-2"
      error={error}
      onNext={handleNext}
    >
      <div className={FIELD_LABEL}>
        <span>What do you work on?</span>
        <span className={FIELD_HINT}>Select all that apply — shown on your profile.</span>
        {services.length === 0 ? (
          <p className="text-sm text-text-muted">
            No specialisms defined. Please try again later.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
            {services.map((service) => (
              <label
                key={service.slug}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2 text-sm font-medium text-text-primary hover:border-brand-blue/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(service.slug)}
                  onChange={() => toggle(service.slug)}
                  className="size-4 rounded border-border accent-brand-blue"
                />
                <span>{service.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={FIELD_LABEL}>
        <span>Service radius — {data.serviceRadiusMiles} miles</span>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={data.serviceRadiusMiles}
          onChange={(e) => update({ serviceRadiusMiles: Number(e.target.value) })}
          className="w-full accent-brand-blue"
        />
        <span className={FIELD_HINT}>How far from your base you'll travel for a job.</span>
      </div>
    </StepShell>
  );
}
