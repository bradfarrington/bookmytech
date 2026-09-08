"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setJobMileage } from "@/app/actions/job-progress";

// The mileage box (Task 30). The mechanic reads the odometer once they're
// with the car and types it here; it's saved on its own so it can't be lost
// to a stale form, and the page re-renders with the stored value. Read-only
// once the job is no longer active.
//
// `required` is set by Task 32 on a servicing / inspection job, where the
// server refuses completion without a reading — the hint tells the mechanic
// before they get that far.

interface MileageFieldProps {
  bookingId: string;
  mileage: number | null;
  canEdit: boolean;
  required?: boolean;
}

export function MileageField({ bookingId, mileage, canEdit, required = false }: MileageFieldProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(mileage != null ? String(mileage) : "");

  const saved = mileage != null ? mileage.toLocaleString("en-GB") : null;
  const dirty = value.trim() !== (mileage != null ? String(mileage) : "");

  function save() {
    const miles = Number(value.replace(/[,\s]/g, ""));
    if (!Number.isInteger(miles) || miles < 0) {
      toast.error("Enter the mileage as a whole number of miles.");
      return;
    }
    startTransition(async () => {
      const res = await setJobMileage(bookingId, miles);
      if (res.ok) {
        toast.success("Mileage saved.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (!canEdit) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-primary">
        <Gauge size={16} className="shrink-0 text-text-muted" />
        {saved ? (
          <span className="font-semibold">{saved} miles</span>
        ) : (
          <span className="text-text-muted">Not recorded</span>
        )}
      </p>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          Odometer reading (miles)
          {required && <span className="ml-1 normal-case text-red-600">· required to complete</span>}
        </span>
        <div className="mt-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Gauge size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              inputMode="numeric"
              pattern="[0-9,]*"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 62410"
              aria-label="Mileage in miles"
              className="w-full rounded-button border border-border bg-surface-card py-2 pl-9 pr-3 text-sm text-text-primary focus:border-brand-blue focus:outline-none"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending || !dirty || !value.trim()}>
            Save
          </Button>
        </div>
      </label>
      <p className="text-xs text-text-muted">
        {saved ? `Recorded: ${saved} miles.` : "Read it off the dashboard when you're with the car."}
      </p>
    </form>
  );
}
