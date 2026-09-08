import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { ProductForm } from "../_components/product-form";

export default function AdminServiceNewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/services"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to services
        </Link>
      </div>
      <header>
        <Overline>Commercial · Services</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Add product</h1>
      </header>
      <ProductForm mode="create" />
    </div>
  );
}
