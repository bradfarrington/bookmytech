import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import { isAagConfigured, isAagSandbox } from "@/lib/aag/client";
import { readAagHealth } from "@/lib/aag/health";
import { createAdminClient } from "@/lib/supabase/admin";
import { AagCheckForm } from "./_components/aag-check-form";
import { AagStatus } from "./_components/aag-status";

// AAG parts-pricing sandbox check (Task 40). Admin-only, read-only: one
// registration + one TecDoc product group → AAG's fitting parts, trade prices
// and branch stock. Exists so the owner can see what the supplier returns
// before anything customer-facing is built on it.

export const dynamic = "force-dynamic";

export default async function AagCheckPage() {
  const configured = isAagConfigured();
  const sandbox = isAagSandbox();
  const health = configured ? await readAagHealth(createAdminClient()) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            AAG parts check
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            Ask Alliance Automotive Group what parts fit a registration in one
            product group, at our trade price, with branch stock and delivery
            estimates. This is a read-only check against{" "}
            {sandbox ? "their sandbox" : "their live system"} — nothing is
            ordered and nothing is saved.
          </p>
        </div>
        <Link href="/admin/parts">
          <Button variant="ghost" iconLeft={ArrowLeft}>
            Parts catalogue
          </Button>
        </Link>
      </header>

      <AagStatus configured={configured} sandbox={sandbox} health={health} />

      <AagCheckForm disabled={!configured} />
    </div>
  );
}
