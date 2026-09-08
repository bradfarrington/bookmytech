import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { DiscountForm } from "../_components/discount-form";

export default function AdminDiscountNewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/discounts"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to discounts
        </Link>
      </div>
      <header>
        <Overline>Commercial · Discounts</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">New discount code</h1>
      </header>
      <DiscountForm mode="create" />
    </div>
  );
}
