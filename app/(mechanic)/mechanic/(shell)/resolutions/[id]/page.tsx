import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/resolutions/status-pill";
import { CaseThread } from "@/components/resolutions/case-thread";
import { CloseCaseButton } from "@/components/resolutions/close-case-button";
import { loadCase, loadMessages } from "@/lib/resolutions/load";

export const dynamic = "force-dynamic";

export default async function MechanicCasePage({
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

  // RLS scopes both reads to this mechanic's own case.
  const kase = await loadCase(supabase, id);
  if (!kase || kase.mechanicId !== user.id) redirect("/mechanic/resolutions");
  const messages = await loadMessages(supabase, id);

  const canClose = kase.status === "open" || kase.status === "in_progress";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link
        href="/mechanic/resolutions"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to Resolution Center
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{kase.reasonLabel}</h1>
          <Link
            href={`/mechanic/jobs/${kase.bookingId}`}
            className="text-sm font-medium text-brand-blue hover:underline"
          >
            Job #{kase.shortRef}
          </Link>
        </div>
        <StatusPill status={kase.status} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">What happened</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{kase.description}</p>
      </div>

      {kase.resolutionNote && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-success">Resolution</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{kase.resolutionNote}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-card p-4">
        <CaseThread caseId={id} messages={messages} viewerRole="mechanic" />
      </div>

      {canClose && (
        <div className="flex justify-end">
          <CloseCaseButton caseId={id} />
        </div>
      )}
    </div>
  );
}
