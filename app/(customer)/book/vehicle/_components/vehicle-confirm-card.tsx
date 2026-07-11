"use client";

import { useState } from "react";
import { CheckCircle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import type { VehicleDetails } from "@/lib/dvla/types";
import { ManualVehicleForm } from "./manual-vehicle-form";

interface VehicleConfirmCardProps {
  details: VehicleDetails;
  reg: string;
  nextHref: string;
}

export function VehicleConfirmCard({ details, reg, nextHref }: VehicleConfirmCardProps) {
  const [showManual, setShowManual] = useState(false);

  const title = [details.yearOfManufacture, details.make, details.model]
    .filter(Boolean)
    .join(" ");

  function titleCase(s: string) {
    return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (showManual) {
    return (
      <ManualVehicleForm
        reg={reg}
        defaultMake={details.make}
        defaultModel={details.model ?? ""}
        defaultYear={details.yearOfManufacture?.toString() ?? ""}
        onBack={() => setShowManual(false)}
        nextHref={nextHref}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={1} />

      <div>
        <h1 className="text-2xl font-bold text-text-primary">Is this your vehicle?</h1>
        <p className="mt-1 text-text-secondary">
          {reg ? (
            <>
              We found the following details for{" "}
              <span className="font-bold tracking-wide text-text-primary">{reg}</span>
            </>
          ) : (
            "Please check the details you entered."
          )}
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-50">
            <CheckCircle size={20} className="text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-text-primary">{title || reg}</p>
            {details.colour && (
              <p className="text-sm text-text-secondary">{titleCase(details.colour)}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface p-4 text-sm">
          {details.fuelType && (
            <Row label="Fuel" value={titleCase(details.fuelType)} />
          )}
          {typeof details.engineCapacity === "number" && (
            <Row label="Engine" value={`${details.engineCapacity} cc`} />
          )}
          {details.motStatus && (
            <Row
              label="MOT"
              value={displayStatus(details.motStatus)}
              tone={statusTone(details.motStatus)}
            />
          )}
          {details.taxStatus && (
            <Row
              label="Tax"
              value={details.taxStatus}
              tone={statusTone(details.taxStatus)}
            />
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <a href={nextHref}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            iconRight={ChevronRight}
          >
            Yes, this is my car
          </Button>
        </a>
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className="text-center text-sm font-medium text-brand-blue hover:underline"
        >
          Details look wrong? Edit manually
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "error" | "pending" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        {label}
      </dt>
      <dd>
        <Pill tone={tone ?? "neutral"}>{value}</Pill>
      </dd>
    </div>
  );
}

// DVLA's raw wording is awkward in a pill — remap the worst offenders.
function displayStatus(status: string): string {
  return status.toLowerCase() === "not valid" ? "Expired" : status;
}

function statusTone(status: string): "success" | "error" | "pending" | "neutral" {
  const l = status.toLowerCase();
  // Negatives first — "Not valid" contains "valid" and "Untaxed" contains "taxed".
  if (l.startsWith("not") || l.includes("expired") || l.includes("untaxed") || l.includes("sorn")) return "error";
  if (l.includes("valid") || l.includes("taxed")) return "success";
  if (l.includes("due")) return "pending";
  return "neutral";
}
