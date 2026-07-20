"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { normaliseReg } from "@/lib/utils";

// Reg-only entry: every booking is a HaynesPro repair priced from the OEM book
// time for the exact vehicle, and that resolution starts from the reg (DVLA →
// HaynesPro). There's no manual make/model path any more — without a reg we
// can't price anything.

export function BookEntry() {
  const router = useRouter();
  const [postcode, setPostcode] = useState("");
  const [reg, setReg] = useState("");

  const pcParam = postcode.trim()
    ? `&postcode=${encodeURIComponent(postcode.trim().toUpperCase())}`
    : "";

  function submitPlate(e: React.FormEvent) {
    e.preventDefault();
    const r = normaliseReg(reg);
    if (!r) return;
    router.push(`/book/vehicle?reg=${encodeURIComponent(r)}${pcParam}`);
  }

  return (
    <div className="flex flex-col gap-7">
      <ProgressStepper currentStep={1} />

      <div className="text-center">
        <h1 className="text-[28px] font-extrabold tracking-[-0.025em] text-text-primary sm:text-3xl">
          Tell us about your car
        </h1>
        <p className="mt-2 text-text-secondary">
          Enter your reg and we&apos;ll match repairs and prices to your exact car.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface-card shadow-card">
        <div className="p-5 sm:p-6">
          <form onSubmit={submitPlate} className="flex flex-col gap-3.5">
            <RegPlateInput
              value={reg}
              onChange={(e) => setReg(e.target.value)}
              name="reg"
              required
              autoFocus
              aria-label="Vehicle registration"
              className="h-14 text-lg"
            />
            <PostcodeField value={postcode} onChange={setPostcode} />
            <Button type="submit" variant="primary" size="lg" fullWidth iconRight={ArrowRight}>
              Get a price
            </Button>
          </form>
        </div>
      </div>

      <p className="text-center text-xs text-text-muted">
        No upfront payment · Vetted mechanics only · 12-month guarantee
      </p>
    </div>
  );
}

function PostcodeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex h-12 items-center gap-2 rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-brand-blue focus-within:bg-surface-card focus-within:ring-2 focus-within:ring-brand-blue/25">
      <Icon icon={MapPin} size={18} className="shrink-0 text-text-muted" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        name="postcode"
        placeholder="Postcode (for accurate pricing)"
        aria-label="Postcode"
        autoComplete="postal-code"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={8}
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-bold uppercase tracking-[0.04em] text-text-primary outline-none placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted"
      />
    </label>
  );
}
