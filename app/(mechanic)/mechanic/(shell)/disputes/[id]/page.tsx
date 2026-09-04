import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DisputeDetail } from "@/components/disputes/dispute-detail";
import { loadDispute } from "@/lib/disputes/load";

export const dynamic = "force-dynamic";

export default async function MechanicDisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const loaded = await loadDispute(id, user.id);
  if (!loaded || loaded.viewerRole !== "mechanic") redirect("/mechanic/disputes");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/mechanic/disputes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} />
          Back to disputes
        </Link>
        <Link
          href={`/mechanic/jobs/${loaded.bookingId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline"
        >
          <Briefcase size={15} />
          View job
        </Link>
      </div>
      <DisputeDetail data={loaded.data} viewerRole="mechanic" isOpener={loaded.isOpener} />
    </div>
  );
}
