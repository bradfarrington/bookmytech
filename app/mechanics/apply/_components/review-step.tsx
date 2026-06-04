"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
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
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-right font-medium text-text-primary">{value || "—"}</span>
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
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
        <Link href={editHref} className="text-xs font-semibold text-brand-blue hover:underline">
          Edit
        </Link>
      </div>
      <div className="divide-y divide-border-subtle">{children}</div>
    </Card>
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
        "Your bank details aren't filled in — go back to the Documents step and re-enter them, then submit.",
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
        docs: Object.fromEntries(
          Object.entries(data.docs).map(([k, v]) => [k, v?.path]),
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-text-primary">Review & submit</h1>
        <p className="text-sm text-text-secondary">
          Check everything looks right, then submit. We'll review within 48 hours.
        </p>
      </div>

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

      <SectionCard title="Specialisms & area" editHref="/mechanics/apply/step-3">
        <Row
          label="Specialisms"
          value={data.specialisms.map(nameForSlug).join(", ")}
        />
        <Row label="Service radius" value={`${data.serviceRadiusMiles} miles`} />
      </SectionCard>

      <SectionCard title="Documents & references" editHref="/mechanics/apply/step-4">
        <Row label="Documents uploaded" value={uploadedDocLabels.join(", ")} />
        <Row label="Bank details" value={bankReady ? "Provided (encrypted)" : "Missing"} />
        <Row label="Reference 1" value={data.references[0].name} />
        <Row label="Reference 2" value={data.references[1].name} />
      </SectionCard>

      {error && (
        <p role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Link href="/mechanics/apply/step-4">
          <Button type="button" variant="ghost" disabled={pending}>
            Back
          </Button>
        </Link>
        <Button type="button" variant="primary" disabled={pending} onClick={handleSubmit}>
          {pending ? "Submitting…" : "Submit application"}
        </Button>
      </div>
    </div>
  );
}
