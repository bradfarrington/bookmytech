"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOC_DEFS } from "@/lib/onboarding/docs";
import { submitApplication } from "@/app/actions/submit-application";
import { useApplication } from "./application-provider";
import { FIELD_ERROR } from "./field";

export interface ServiceLookup {
  slug: string;
  name: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-right font-medium text-text-primary">{value || "Not provided"}</span>
    </div>
  );
}

function SectionCard({
  title,
  editHref,
  children,
}: {
  title: string;
  editHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 px-4 py-4 sm:px-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
        <Link href={editHref} className="text-xs font-semibold text-brand-blue hover:underline">
          Edit
        </Link>
      </div>
      <div className="divide-y divide-border-subtle">{children}</div>
    </div>
  );
}

export function ReviewStep({ services }: { services: ServiceLookup[] }) {
  const router = useRouter();
  const { data, bank, reset } = useApplication();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameForSlug = (slug: string) =>
    services.find((s) => s.slug === slug)?.name ?? slug;

  const bankReady = !!bank.sortCode && !!bank.accountNumber;
  const docDefs = DOC_DEFS.filter((d) => !d.conditional || data.vatRegistered);
  const uploadedDocLabels = docDefs
    .filter((d) => data.docs[d.type])
    .map((d) => d.label);

  function handleSubmit() {
    if (!bankReady) {
      setError(
        "Your bank details aren't filled in. Go back to the Documents step and re-enter them, then submit.",
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitApplication({
        draftId: data.draftId,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        postcode: data.postcode,
        yearsExperience: data.yearsExperience,
        businessType: data.businessType,
        businessName: data.businessName,
        businessNumber: data.businessNumber,
        vatRegistered: data.vatRegistered,
        specialisms: data.specialisms,
        serviceRadiusMiles: data.serviceRadiusMiles,
        // Only the documents this page lists: a VAT file uploaded before the
        // applicant unticked "VAT registered" stays in the draft but isn't
        // sent, because the server now refuses one (lib/applications/validate.ts).
        docs: Object.fromEntries(
          docDefs.map((d) => [d.type, data.docs[d.type]?.path]).filter(([, path]) => path),
        ),
        bankSortCode: bank.sortCode,
        bankAccountNumber: bank.accountNumber,
        references: data.references,
        sourceAreaSlug: data.sourceAreaSlug || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      router.push("/mechanics/apply/submitted");
    });
  }

  // One white card, like every other step (StepShell), pulled up over the
  // layout's gradient band (Task 46).
  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-white shadow-float">
      <div className="border-b border-border-subtle px-5 py-6 sm:px-8 sm:py-7">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-text-primary sm:text-[28px]">
          Review and submit
        </h1>
        <p className="mt-1.5 text-[15px] leading-[1.55] text-text-secondary">
          Check everything looks right, then submit. Our team reviews applications within a few
          working days.
        </p>
      </div>

      <div className="space-y-3 px-5 py-6 sm:px-8">
        <SectionCard title="About you" editHref="/mechanics/apply/step-1">
          <Row label="Name" value={data.fullName} />
          <Row label="Email" value={data.email} />
          <Row label="Phone" value={data.phone} />
          <Row label="Postcode" value={data.postcode} />
          <Row label="Experience" value={data.yearsExperience ? `${data.yearsExperience} years` : ""} />
        </SectionCard>

        <SectionCard title="Your business" editHref="/mechanics/apply/step-2">
          <Row
            label="Type"
            value={data.businessType === "limited_company" ? "Limited company" : data.businessType === "sole_trader" ? "Sole trader" : ""}
          />
          <Row label="Business name" value={data.businessName} />
          <Row
            label={data.businessType === "limited_company" ? "Company number" : "UTR"}
            value={data.businessNumber}
          />
          <Row label="VAT registered" value={data.vatRegistered ? "Yes" : "No"} />
        </SectionCard>

        <SectionCard title="Specialisms and area" editHref="/mechanics/apply/step-3">
          <Row
            label="Specialisms"
            value={data.specialisms.map(nameForSlug).join(", ")}
          />
          <Row label="Service radius" value={`${data.serviceRadiusMiles} miles`} />
        </SectionCard>

        <SectionCard title="Documents and references" editHref="/mechanics/apply/step-4">
          <Row
            label="Documents uploaded"
            value={uploadedDocLabels.length ? uploadedDocLabels.join(", ") : "None yet (28-day grace after approval)"}
          />
          <Row label="Bank details" value={bankReady ? "Provided (encrypted)" : "Missing"} />
          <Row label="Reference 1" value={data.references[0].name} />
          <Row label="Reference 2" value={data.references[1].name} />
        </SectionCard>
      </div>

      <div className="space-y-4 border-t border-border-subtle bg-surface/70 px-5 py-5 sm:px-8">
        {error && (
          <p role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Link href="/mechanics/apply/step-4">
            <Button type="button" variant="ghost" size="lg" disabled={pending} className="bg-white font-bold">
              Back
            </Button>
          </Link>
          <Button
            type="button"
            variant="primary"
            size="lg"
            iconRight={pending ? undefined : ArrowRight}
            disabled={pending}
            onClick={handleSubmit}
            className="font-bold"
          >
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        </div>

        <p className="text-right text-[11px] leading-[1.5] text-text-muted">
          By submitting your application you agree to the{" "}
          <Link href="/mechanic-agreement" target="_blank" className="font-semibold text-brand-blue hover:underline">
            Mechanic Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="font-semibold text-brand-blue hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
