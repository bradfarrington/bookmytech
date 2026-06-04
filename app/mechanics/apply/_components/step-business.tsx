"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { useApplication } from "./application-provider";
import { StepShell } from "./step-shell";
import { FIELD_INPUT, FIELD_LABEL, FIELD_HINT } from "./field";

const BUSINESS_TYPES = [
  { value: "sole_trader", label: "Sole trader" },
  { value: "limited_company", label: "Limited company" },
] as const;

const VAT_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
] as const;

export function StepBusiness() {
  const router = useRouter();
  const { data, update } = useApplication();
  const [error, setError] = useState<string | null>(null);

  const isLtd = data.businessType === "limited_company";

  function handleNext() {
    if (!data.businessType) return setError("Please choose how you operate.");
    if (!data.businessName.trim())
      return setError("Please enter your business name.");
    if (!data.businessNumber.trim())
      return setError(
        isLtd ? "Please enter your company number." : "Please enter your UTR.",
      );
    setError(null);
    router.push("/mechanics/apply/step-3");
  }

  return (
    <StepShell
      title="Your business"
      intro="So we can verify you're a registered, trading professional."
      backHref="/mechanics/apply/step-1"
      error={error}
      onNext={handleNext}
    >
      <div className={FIELD_LABEL}>
        <span>How do you operate?</span>
        <Select
          value={data.businessType}
          onChange={(value) =>
            update({ businessType: value as "sole_trader" | "limited_company" })
          }
          options={BUSINESS_TYPES}
          placeholder="Select business type…"
          aria-label="Business type"
        />
      </div>

      <label className={FIELD_LABEL}>
        <span>Business name</span>
        <input
          type="text"
          value={data.businessName}
          onChange={(e) => update({ businessName: e.target.value })}
          required
          placeholder="e.g. Wilson Mobile Mechanics"
          className={FIELD_INPUT}
        />
      </label>

      <label className={FIELD_LABEL}>
        <span>{isLtd ? "Company number" : "UTR (Unique Taxpayer Reference)"}</span>
        <input
          type="text"
          value={data.businessNumber}
          onChange={(e) => update({ businessNumber: e.target.value })}
          required
          placeholder={isLtd ? "e.g. 09876543" : "e.g. 1234567890"}
          className={FIELD_INPUT}
        />
        <span className={FIELD_HINT}>
          {isLtd
            ? "Your 8-digit Companies House number."
            : "Your 10-digit Self Assessment reference."}
        </span>
      </label>

      <div className={FIELD_LABEL}>
        <span>Are you VAT registered?</span>
        <div className="max-w-[200px]">
          <Select
            value={data.vatRegistered ? "yes" : "no"}
            onChange={(value) => update({ vatRegistered: value === "yes" })}
            options={VAT_OPTIONS}
            aria-label="VAT registered"
          />
        </div>
        <span className={FIELD_HINT}>
          {data.vatRegistered
            ? "You'll be asked to upload your VAT registration document."
            : "You can skip the VAT document."}
        </span>
      </div>
    </StepShell>
  );
}
