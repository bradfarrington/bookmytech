import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardHeader } from "../../_components/dashboard-header";
import { DisputeDetail } from "@/components/disputes/dispute-detail";
import { loadDispute } from "@/lib/disputes/load";

export const dynamic = "force-dynamic";

export default async function CustomerDisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const loaded = await loadDispute(id, user.id);
  if (!loaded || loaded.viewerRole !== "customer") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-dvh bg-surface">
      <DashboardHeader name={profile?.full_name ?? user.email ?? ""} avatarUrl={profile?.avatar_url ?? null} />
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
          <ArrowLeft size={15} />
          Back to dashboard
        </Link>
        <DisputeDetail data={loaded.data} viewerRole="customer" isOpener={loaded.isOpener} />
      </main>
    </div>
  );
}
