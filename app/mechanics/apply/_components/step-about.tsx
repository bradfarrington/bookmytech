"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApplication } from "./application-provider";
import { StepShell } from "./step-shell";
import { FIELD_INPUT, FIELD_LABEL, FIELD_HINT } from "./field";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?(\s?[0-9][A-Z]{2})?$/i;

export function StepAbout() {
  const router = useRouter();
  const { data, update } = useApplication();
  const [error, setError] = useState<string | null>(null);

  function handleNext() {
    if (!data.fullName.trim()) return setError("Please enter your full name.");
    if (!EMAIL_RE.test(data.email.trim()))
      return setError("Please enter a valid email address.");
    if (!data.phone.trim()) return setError("Please enter a phone number.");
    if (!POSTCODE_RE.test(data.postcode.trim()))
      return setError("Please enter a valid UK postcode.");
    setError(null);
    router.push("/mechanics/apply/step-2");
  }

  return (
    <StepShell
      title="About you"
      intro="Let's start with your contact details. Takes about 5 minutes in total."
      backHref={null}
      error={error}
      onNext={handleNext}
    >
      <label className={FIELD_LABEL}>
        <span>Full name</span>
        <input
          type="text"
          value={data.fullName}
          onChange={(e) => update({ fullName: e.target.value })}
          required
          placeholder="e.g. Mike Wilson"
          className={FIELD_INPUT}
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          <span>Email</span>
          <input
            type="email"
            value={data.email}
            onChange={(e) => update({ email: e.target.value })}
            required
            placeholder="mike@example.com"
            className={FIELD_INPUT}
          />
          <span className={FIELD_HINT}>We'll send your application updates here.</span>
        </label>

        <label className={FIELD_LABEL}>
          <span>Phone</span>
          <input
            type="tel"
            value={data.phone}
            onChange={(e) => update({ phone: e.target.value })}
            required
            placeholder="07700 900000"
            className={FIELD_INPUT}
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          <span>Postcode</span>
          <input
            type="text"
            value={data.postcode}
            onChange={(e) => update({ postcode: e.target.value.toUpperCase() })}
            required
            placeholder="SE15 5DT"
            autoCapitalize="characters"
            maxLength={8}
            className={`${FIELD_INPUT} uppercase`}
          />
          <span className={FIELD_HINT}>Where you're based — drives job matching.</span>
        </label>

        <label className={FIELD_LABEL}>
          <span>
            Years of experience{" "}
            <span className="font-normal text-text-muted">(optional)</span>
          </span>
          <input
            type="number"
            min={0}
            max={70}
            value={data.yearsExperience}
            onChange={(e) => update({ yearsExperience: e.target.value })}
            placeholder="e.g. 8"
            className={FIELD_INPUT}
          />
        </label>
      </div>
    </StepShell>
  );
}
