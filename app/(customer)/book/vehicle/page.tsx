import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";
import { normaliseReg } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { VehicleConfirmCard } from "./_components/vehicle-confirm-card";

interface VehiclePageProps {
  searchParams: Promise<{
    reg?: string;
    make?: string;
    model?: string;
    year?: string;
  }>;
}

export default async function VehiclePage({ searchParams }: VehiclePageProps) {
  const params = await searchParams;
  const raw = params.reg ?? "";

  if (!raw.trim()) {
    redirect("/book");
  }

  const reg = normaliseReg(raw);
  const nextHref = `/book/service?reg=${encodeURIComponent(reg)}`;

  // If we already have manually-entered vehicle details, skip the lookup
  if (params.make) {
    const make = params.make.toUpperCase();
    const model = params.model ?? "";
    const year = params.year ? parseInt(params.year, 10) : undefined;
    return (
      <VehicleConfirmCard
        details={{
          registrationNumber: reg,
          make,
          model: model || undefined,
          yearOfManufacture: year,
        }}
        reg={reg}
        nextHref={`${nextHref}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`}
      />
    );
  }

  const result = await lookupVehicleAction(reg);

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <ProgressStepper currentStep={1} />

        <div>
          <h1 className="text-2xl font-bold text-text-primary">We couldn&apos;t find your vehicle</h1>
          <p className="mt-1 text-text-secondary">
            Registration: <span className="font-bold">{reg}</span>
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm text-red-700">{result.message}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/book">
            <Button variant="secondary" size="lg" fullWidth iconLeft={ArrowLeft}>
              Try a different reg
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <VehicleConfirmCard
      details={result.details}
      reg={reg}
      nextHref={nextHref}
    />
  );
}
