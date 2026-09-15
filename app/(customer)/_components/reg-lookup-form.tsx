"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { cn, normaliseReg } from "@/lib/utils";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";
import { track, FUNNEL_EVENTS } from "@/lib/analytics/track";
import type { VehicleDetails } from "@/lib/dvla/types";
import {
  VehicleLookupModal,
  type VehicleLookupStatus,
} from "./vehicle-lookup-modal";

export type RegLookupFormVariant = "card" | "hero" | "final";

export interface RegLookupFormProps {
  /** Pre-fills the reg input (e.g. for the hero's example state). */
  defaultReg?: string;
  /** Pre-fills the postcode input. */
  defaultPostcode?: string;
  className?: string;
  /**
   * `card` (default) is the white card. `hero` and `final` are the glass lookup
   * boxes on the homepage's gradient sections (Task 46); `hero` adds the label
   * row and the pre-authorisation hint.
   */
  variant?: RegLookupFormVariant;
  /** id for the reg input, so other controls can focus it (see get-price.ts). */
  inputId?: string;
}

interface LookupState {
  reg: string;
  postcode: string;
  status: VehicleLookupStatus;
  details?: VehicleDetails;
  errorMessage?: string;
}

export function RegLookupForm({
  defaultReg = "",
  defaultPostcode = "",
  className,
  variant = "card",
  inputId,
}: RegLookupFormProps) {
  const [reg, setReg] = useState(defaultReg);
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalised = normaliseReg(reg);
    if (!normalised) return;
    const trimmedPostcode = postcode.trim();
    track(FUNNEL_EVENTS.regLookupStarted, { reg: normalised });
    setLookup({
      reg: normalised,
      postcode: trimmedPostcode,
      status: "loading",
    });
    startTransition(async () => {
      const result = await lookupVehicleAction(normalised);
      setLookup((current) => {
        // Guard against the user closing the modal / submitting a new reg
        // before the response lands.
        if (!current || current.reg !== normalised) return current;
        if (result.ok) {
          return { ...current, status: "success", details: result.details };
        }
        return { ...current, status: "error", errorMessage: result.message };
      });
    });
  }

  const regInput = {
    id: inputId,
    value: reg,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setReg(e.target.value),
    name: "reg",
    required: true,
    "aria-label": "Vehicle registration",
  };

  const postcodeInput = {
    type: "text",
    value: postcode,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPostcode(e.target.value),
    name: "postcode",
    placeholder: "Postcode",
    "aria-label": "Postcode",
    autoComplete: "postal-code",
    autoCapitalize: "characters",
    autoCorrect: "off",
    spellCheck: false,
    maxLength: 8,
  } as const;

  return (
    <>
      {variant === "card" ? (
        <form
          onSubmit={handleSubmit}
          data-reg-lookup
          className={cn(
            "flex w-full flex-col gap-2.5 rounded-2xl border border-border bg-surface-card p-3.5 shadow-card md:flex-row md:items-center",
            className,
          )}
        >
          <RegPlateInput {...regInput} />
          <label
            className={cn(
              "flex h-10 min-w-0 items-center gap-2 rounded-md border-[1.5px] border-border bg-surface px-3",
              "transition-colors focus-within:border-brand-blue focus-within:bg-surface-card focus-within:ring-2 focus-within:ring-brand-blue/25",
              "md:flex-1 md:border-0 md:bg-transparent md:px-2 md:focus-within:bg-transparent md:focus-within:ring-0",
            )}
          >
            <Icon icon={MapPin} size={16} className="shrink-0 text-text-muted" />
            <input
              {...postcodeInput}
              className={cn(
                "h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-bold uppercase tracking-[0.04em] text-text-primary outline-none",
                "placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted",
              )}
            />
          </label>
          <Button type="submit" variant="primary" iconRight={ArrowRight}>
            Get a price
          </Button>
        </form>
      ) : (
        <form
          onSubmit={handleSubmit}
          data-reg-lookup
          className={cn(
            "w-full rounded-[18px] border p-[18px] text-left backdrop-blur-[8px]",
            variant === "hero" ? "border-white/15 bg-white/[0.06]" : "border-white/20 bg-white/10",
            className,
          )}
        >
          {variant === "hero" && (
            <div className="mb-2.5 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.06em] text-white/75">
              <span>Enter your reg</span>
              <span className="font-semibold normal-case tracking-[0.02em] text-white/60">
                See prices in 60s
              </span>
            </div>
          )}

          <div className="grid gap-2.5 min-[521px]:grid-cols-[1fr_auto]">
            <RegPlateInput size="lg" placeholder="AB12 CDE" {...regInput} />
            <Button
              type="submit"
              variant={variant === "hero" ? "primary" : "secondary"}
              size="lg"
              iconRight={ArrowRight}
              className={cn(
                "h-[60px] whitespace-nowrap px-[22px] text-[15px] font-bold",
                variant === "hero"
                  ? "shadow-[0_6px_16px_rgba(37,99,235,0.28)]"
                  : "border-transparent bg-white text-brand-blue-dark hover:bg-surface",
              )}
            >
              Get my price
            </Button>
          </div>

          <label className="mt-2.5 flex h-11 min-w-0 items-center gap-2 rounded-[10px] border border-white/15 bg-white/10 px-3 transition-colors focus-within:border-white/50">
            <Icon icon={MapPin} size={16} className="shrink-0 text-white/60" />
            <input
              {...postcodeInput}
              className={cn(
                "h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-bold uppercase tracking-[0.04em] text-white outline-none",
                "placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-white/55",
              )}
            />
          </label>

          {variant === "hero" && (
            <p className="mt-3 flex items-center gap-2 text-xs text-white/70">
              <Icon icon={Lock} size={14} className="shrink-0" />
              Payment pre-authorised, only charged when the job&apos;s done.
            </p>
          )}
        </form>
      )}

      <VehicleLookupModal
        open={lookup !== null}
        onClose={() => setLookup(null)}
        reg={lookup?.reg ?? ""}
        postcode={lookup?.postcode}
        status={lookup?.status ?? "loading"}
        details={lookup?.details}
        errorMessage={lookup?.errorMessage}
        onContinue={() => {
          const r = lookup?.reg ?? "";
          const p = lookup?.postcode ?? "";
          const url = `/book/vehicle?reg=${encodeURIComponent(r)}${p ? `&postcode=${encodeURIComponent(p)}` : ""}`;
          router.push(url);
        }}
      />
    </>
  );
}
