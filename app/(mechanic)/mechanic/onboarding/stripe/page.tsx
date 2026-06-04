import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StripeOnboardingPanel } from "./_components/onboarding-panel";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ return?: string; refresh?: string }>;
}

export default async function StripeOnboardingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <Link
        href="/mechanic/jobs"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Get paid — connect your bank
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Book My Tech pays you through Stripe. Connect your bank account so your
          earnings can land automatically after each completed job. You won&apos;t
          be able to go online for jobs until this is done.
        </p>
      </div>

      <StripeOnboardingPanel
        hasAccount={Boolean(mechanic?.stripe_account_id)}
        payoutsEnabled={Boolean(mechanic?.stripe_payouts_enabled)}
        onboardingComplete={Boolean(mechanic?.stripe_onboarding_complete)}
        justReturned={params.return === "1"}
      />
    </div>
  );
}
