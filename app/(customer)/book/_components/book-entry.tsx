"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Combobox } from "@/components/ui/combobox";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { cn, normaliseReg } from "@/lib/utils";
import { VEHICLE_MAKES, modelsForMake, yearOptions } from "@/lib/vehicles/catalogue";

type Tab = "plate" | "details";

export function BookEntry() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("plate");

  // Shared
  const [postcode, setPostcode] = useState("");

  // Plate tab
  const [reg, setReg] = useState("");

  // Details tab
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");

  const models = useMemo(() => modelsForMake(make), [make]);
  const years = useMemo(() => yearOptions().map(String), []);

  const pcParam = postcode.trim()
    ? `&postcode=${encodeURIComponent(postcode.trim().toUpperCase())}`
    : "";

  function submitPlate(e: React.FormEvent) {
    e.preventDefault();
    const r = normaliseReg(reg);
    if (!r) return;
    router.push(`/book/vehicle?reg=${encodeURIComponent(r)}${pcParam}`);
  }

  function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!make.trim()) return;
    const q =
      `make=${encodeURIComponent(make.trim())}` +
      `&model=${encodeURIComponent(model.trim())}` +
      (year.trim() ? `&year=${encodeURIComponent(year.trim())}` : "");
    router.push(`/book/vehicle?${q}${pcParam}`);
  }

  return (
    <div className="flex flex-col gap-7">
      <ProgressStepper currentStep={1} />

      <div className="text-center">
        <h1 className="text-[28px] font-extrabold tracking-[-0.025em] text-text-primary sm:text-3xl">
          Tell us about your car
        </h1>
        <p className="mt-2 text-text-secondary">
          Enter your reg for an instant match — or pick your make and model.
        </p>
      </div>

      {/* No overflow-hidden here — it would clip the Combobox dropdown. The tab
          row clips its own corners instead. */}
      <div className="rounded-2xl border border-border bg-surface-card shadow-card">
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="How to identify your car"
          className="grid grid-cols-2 overflow-hidden rounded-t-2xl border-b border-border"
        >
          <TabButton
            id="tab-plate"
            controls="panel-plate"
            active={tab === "plate"}
            onClick={() => setTab("plate")}
          >
            Use number plate
          </TabButton>
          <TabButton
            id="tab-details"
            controls="panel-details"
            active={tab === "details"}
            onClick={() => setTab("details")}
          >
            Use car details
          </TabButton>
        </div>

        <div className="p-5 sm:p-6">
          {tab === "plate" ? (
            <form
              id="panel-plate"
              role="tabpanel"
              aria-labelledby="tab-plate"
              onSubmit={submitPlate}
              className="flex flex-col gap-3.5"
            >
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
          ) : (
            <form
              id="panel-details"
              role="tabpanel"
              aria-labelledby="tab-details"
              onSubmit={submitDetails}
              className="flex flex-col gap-3.5"
            >
              <FieldLabel label="Make">
                <Combobox
                  value={make}
                  onChange={(v) => {
                    setMake(v);
                    setModel(""); // a new make invalidates the previously picked model
                  }}
                  options={VEHICLE_MAKES}
                  placeholder="Search make — e.g. Volkswagen"
                  aria-label="Vehicle make"
                />
              </FieldLabel>

              <div className="grid grid-cols-2 gap-3.5">
                <FieldLabel label="Model">
                  <Combobox
                    value={model}
                    onChange={setModel}
                    options={models}
                    disabled={!make.trim()}
                    placeholder={make.trim() ? "Search model" : "Pick a make first"}
                    aria-label="Vehicle model"
                  />
                </FieldLabel>
                <FieldLabel label="Year">
                  <Combobox
                    value={year}
                    onChange={setYear}
                    options={years}
                    placeholder="e.g. 2021"
                    aria-label="Year of manufacture"
                  />
                </FieldLabel>
              </div>

              <PostcodeField value={postcode} onChange={setPostcode} />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                iconRight={ArrowRight}
                disabled={!make.trim()}
              >
                Get a price
              </Button>
            </form>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-text-muted">
        No upfront payment · Vetted mechanics only · 12-month guarantee
      </p>
    </div>
  );
}

function TabButton({
  id,
  controls,
  active,
  onClick,
  children,
}: {
  id: string;
  controls: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative px-4 py-3.5 text-sm font-bold tracking-wide transition-colors",
        active
          ? "text-brand-blue"
          : "text-text-muted hover:bg-surface hover:text-text-secondary",
      )}
    >
      {children}
      <span
        className={cn(
          "absolute inset-x-0 bottom-0 h-0.5 transition-colors",
          active ? "bg-brand-blue" : "bg-transparent",
        )}
      />
    </button>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-text-primary">{label}</label>
      {children}
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
