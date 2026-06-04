import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { AreaWizard } from "./_components/area-wizard";

export default function AdminAreaSetupPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/areas"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to areas
        </Link>
      </div>
      <header>
        <Overline>Commercial · Areas</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Launch a city
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Define the area, set pricing, plan recruitment, then save it as planned
          or activate it straight away.
        </p>
      </header>
      <AreaWizard />
    </div>
  );
}
