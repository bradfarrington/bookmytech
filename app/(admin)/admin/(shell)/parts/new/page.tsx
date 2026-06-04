import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { PartForm } from "../_components/part-form";

export default function AdminPartNewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/parts"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to parts
        </Link>
      </div>
      <header>
        <Overline>Commercial · Parts</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Add part
        </h1>
      </header>
      <PartForm mode="create" />
    </div>
  );
}
