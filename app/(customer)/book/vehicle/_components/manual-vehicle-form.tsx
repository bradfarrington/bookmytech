"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressStepper } from "@/components/customer/progress-stepper";

interface ManualVehicleFormProps {
  reg: string;
  defaultMake: string;
  defaultModel: string;
  defaultYear: string;
  onBack: () => void;
  nextHref: string;
}

export function ManualVehicleForm({
  reg,
  defaultMake,
  defaultModel,
  defaultYear,
  onBack,
  nextHref,
}: ManualVehicleFormProps) {
  const [make, setMake] = useState(defaultMake);
  const [model, setModel] = useState(defaultModel);
  const [year, setYear] = useState(defaultYear);

  const href = `${nextHref}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`;

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={1} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex size-9 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Edit vehicle details</h1>
          <p className="text-sm text-text-secondary">{reg}</p>
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <Field label="Make" value={make} onChange={setMake} placeholder="e.g. Volkswagen" />
          <Field label="Model" value={model} onChange={setModel} placeholder="e.g. Golf" />
          <Field label="Year" value={year} onChange={setYear} placeholder="e.g. 2021" inputMode="numeric" />
        </div>
      </Card>

      <a href={href}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          iconRight={ChevronRight}
          disabled={!make.trim()}
        >
          Confirm vehicle
        </Button>
      </a>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-text-primary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-12 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
      />
    </div>
  );
}
