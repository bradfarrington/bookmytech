"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBookingWhen } from "@/lib/slots";
import { stepQuery, type BookingBaseParams, type BookingTimeParams } from "@/lib/bookings/step-params";
import { TimePicker, isTimeOpen, timeParamsFrom, timeValueFrom, type TimeValue } from "../../_components/time-picker";

// Step 4 of the funnel (Task 47): pick a day and an arrival window, then go on
// to the address. The chosen time travels in the URL; it isn't personal.

interface TimeStepProps {
  base: BookingBaseParams;
  /** The time already chosen, when the customer came back to change it. */
  initialTime: BookingTimeParams | null;
}

export function TimeStep({ base, initialTime }: TimeStepProps) {
  const router = useRouter();
  const [value, setValue] = useState<TimeValue>(() => timeValueFrom(initialTime));

  // Re-read the clock every minute, so a window closes while the page is open
  // rather than being carried forward after it has passed. UK time throughout.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const open = isTimeOpen(value, now);
  const time = timeParamsFrom(value);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[20px] border border-border bg-white p-5 shadow-card sm:p-6">
        <TimePicker value={value} onChange={setValue} now={now} />
      </div>

      <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-white p-4 shadow-float">
        <p className="mb-3 text-sm text-text-secondary">
          {open && time ? (
            <>
              <span className="font-semibold text-text-primary">
                {formatBookingWhen({
                  scheduled_at: time.slot,
                  slot_window: time.window,
                  candidate_days: time.days,
                })}
              </span>
            </>
          ) : value.flexible ? (
            "Tick at least two days"
          ) : (
            "Pick a day and an arrival window"
          )}
        </p>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!open || !time}
          iconRight={ChevronRight}
          className="font-bold"
          onClick={() => {
            if (!open || !time) return;
            router.push(`/book/address?${stepQuery(base, time)}`);
          }}
        >
          Continue
        </Button>
        <p className="mt-2 text-center text-[12px] text-text-muted">
          Your job goes to vetted mechanics near you once you confirm.
        </p>
      </div>
    </div>
  );
}
